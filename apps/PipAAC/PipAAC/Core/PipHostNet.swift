//
//  PipHostNet.swift
//  PipAAC
//
//  fetch, timers and WebSocket for the core's sync loop (044 C2) — the
//  Swift side of the shims in scripts/ios/jsc_shims.mjs. Every function
//  here that JS calls runs on the core queue; every completion hops back
//  with PipCore.post (queue.async) — see PipHost.swift's concurrency rule.
//

import Foundation
import JavaScriptCore

nonisolated extension PipHost {
    // MARK: timers (queue-only)

    /// One-shot; the JS shim re-arms intervals. asyncAfter on the core
    /// queue IS the async hop, so the fire runs on-queue and needs no
    /// extra post. A cleared timer's work item is cancelled and never
    /// runs; one already past that point finds no JS entry and no-ops.
    func timerStart(_ id: Int, _ ms: Double) {
        guard let q = core?.jsQueue else { return }
        dispatchPrecondition(condition: .onQueue(q))
        timers[id]?.cancel()
        let item = DispatchWorkItem { [weak self] in
            guard let self, let core = self.core else { return }
            dispatchPrecondition(condition: .onQueue(core.jsQueue))
            self.timers[id] = nil
            core.withContext { self.call($0, "__pipFire", [id]) }
        }
        timers[id] = item
        q.asyncAfter(deadline: .now() + .milliseconds(Int(max(0, ms))), execute: item)
    }

    func timerCancel(_ id: Int) {
        if let q = core?.jsQueue { dispatchPrecondition(condition: .onQueue(q)) }
        timers.removeValue(forKey: id)?.cancel()
    }

    // MARK: fetch (queue-only to start; completion hops via settle)

    func startFetch(_ id: Int, _ a: [String: Any]) {
        guard let s = a["url"] as? String, let url = URL(string: s) else {
            settle(id, .failure(PipHostError("fetch: bad url")))
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = a["method"] as? String ?? "GET"
        for (k, v) in (a["headers"] as? [String: String]) ?? [:] { req.setValue(v, forHTTPHeaderField: k) }
        if let b = a["body"] as? String, let d = Data(base64Encoded: b) { req.httpBody = d }
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let task = session.dataTask(with: req) { [weak self] data, resp, err in
            guard let self else { return }
            // Runs on URLSession's delegate queue: build the result, then
            // settle() re-enters JS via queue.async. No JS touch here.
            if let err {
                if (err as? URLError)?.code == .cancelled { return } // JS already rejected
                self.settle(id, .failure(PipHostError("fetch failed: \(err.localizedDescription)")))
                return
            }
            guard let http = resp as? HTTPURLResponse else {
                self.settle(id, .failure(PipHostError("fetch: not an HTTP response")))
                return
            }
            let headers: [[String]] = http.allHeaderFields.compactMap { k, v in
                guard let k = k as? String, let v = v as? String else { return nil }
                return [k.lowercased(), v]
            }
            let body: [String: Any] = [
                "status": http.statusCode,
                "statusText": HTTPURLResponse.localizedString(forStatusCode: http.statusCode),
                "headers": headers,
                "body": (data ?? Data()).base64EncodedString(),
            ]
            do { self.settle(id, .success(try Self.encode(body))) }
            catch { self.settle(id, .failure(error)) }
        }
        tasks[id] = task
        task.resume()
    }

    /// 044 E6b: the same request, but the body is handed to JS as it
    /// arrives. `id` settles ONCE with the head; the body follows as
    /// __pipFetchEvent(sid, "chunk"|"end"|"error", data). A failure before
    /// the head rejects the fetch.
    func startFetchStream(_ id: Int, _ a: [String: Any]) {
        guard let s = a["url"] as? String, let url = URL(string: s), let sid = a["sid"] as? Int else {
            settle(id, .failure(PipHostError("fetch: bad url")))
            return
        }
        var req = URLRequest(url: url)
        req.httpMethod = a["method"] as? String ?? "GET"
        for (k, v) in (a["headers"] as? [String: String]) ?? [:] { req.setValue(v, forHTTPHeaderField: k) }
        if let b = a["body"] as? String, let d = Data(base64Encoded: b) { req.httpBody = d }
        req.cachePolicy = .reloadIgnoringLocalCacheData
        let task = streamSession.dataTask(with: req)
        task.taskDescription = "\(id):\(sid)"
        tasks[id] = task
        task.resume()
    }

    /// Any thread. The head of a streamed fetch -> settles the fetch.
    func streamHead(_ id: Int, _ http: HTTPURLResponse) {
        let headers: [[String]] = http.allHeaderFields.compactMap { k, v in
            guard let k = k as? String, let v = v as? String else { return nil }
            return [k.lowercased(), v]
        }
        let head: [String: Any] = [
            "status": http.statusCode,
            "statusText": HTTPURLResponse.localizedString(forStatusCode: http.statusCode),
            "headers": headers,
        ]
        let json = (try? Self.encode(head)) ?? ""
        core?.post { [self] ctx in
            streamHeads.insert(id)
            call(ctx, "__pipSettle", [id, true, json])
        }
    }

    /// Any thread. A body event for a streamed fetch whose head went out.
    func streamEvent(_ id: Int, _ sid: Int, _ type: String, _ data: String?) {
        core?.post { [self] ctx in
            guard streamHeads.contains(id) else { return }
            if type != "chunk" { streamHeads.remove(id); tasks[id] = nil }
            call(ctx, "__pipFetchEvent", [sid, type, data ?? NSNull()])
        }
    }

    /// Any thread. The stream ended before its head: reject the fetch.
    func streamFailed(_ id: Int, _ message: String) {
        core?.post { [self] _ in
            guard !streamHeads.contains(id) else { return }
            settle(id, .failure(PipHostError(message)))
        }
    }

    func cancelFetch(_ id: Int) {
        if let q = core?.jsQueue { dispatchPrecondition(condition: .onQueue(q)) }
        tasks.removeValue(forKey: id)?.cancel()
    }

    // MARK: WebSocket (text frames)

    func wsOpen(_ id: Int, _ urlString: String) {
        if let q = core?.jsQueue { dispatchPrecondition(condition: .onQueue(q)) }
        guard let url = URL(string: urlString) else {
            sockets[id] = nil
            wsEmit(id, "error", nil, force: true)
            wsEmit(id, "close", nil, force: true)
            return
        }
        let task = wsSession.webSocketTask(with: url)
        task.taskDescription = String(id)
        sockets[id] = task
        task.resume()
        wsListen(id, task)
    }

    func wsSend(_ id: Int, _ text: String) {
        if let q = core?.jsQueue { dispatchPrecondition(condition: .onQueue(q)) }
        sockets[id]?.send(.string(text)) { [weak self] err in
            if err != nil { self?.wsEmit(id, "error", nil) }
        }
    }

    func wsClose(_ id: Int) {
        if let q = core?.jsQueue { dispatchPrecondition(condition: .onQueue(q)) }
        guard let task = sockets[id] else {
            wsEmit(id, "close", nil, force: true)
            return
        }
        task.cancel(with: .goingAway, reason: nil)
        // The delegate's didClose / didCompleteWithError delivers "close".
    }

    private func wsListen(_ id: Int, _ task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let m):
                switch m {
                case .string(let s): self.wsEmit(id, "message", s)
                case .data(let d): self.wsEmit(id, "message", String(decoding: d, as: UTF8.self))
                @unknown default: break
                }
                self.wsListen(id, task)
            case .failure:
                self.wsEmit(id, "error", nil) // the delegate follows with "close"
            }
        }
    }

    /// Any thread. Delivers a socket event to JS through the core queue.
    /// `close` is delivered once per socket: after it the socket is gone
    /// and later events for the id are dropped here (JS drops them too).
    func wsEmit(_ id: Int, _ type: String, _ data: String?, force: Bool = false) {
        core?.post { [self] ctx in
            if !force && sockets[id] == nil { return }
            if type == "close" { sockets[id] = nil }
            call(ctx, "__pipWsEvent", [id, type, data ?? NSNull()])
        }
    }
}

/// URLSessionWebSocketTask lifecycle -> JS events. Delegate callbacks
/// arrive on URLSession's queue; they only call wsEmit (a queue.async hop).
nonisolated final class PipWSDelegate: NSObject, URLSessionWebSocketDelegate, @unchecked Sendable {
    weak var host: PipHost?

    private func id(_ t: URLSessionTask) -> Int? { t.taskDescription.flatMap(Int.init) }

    func urlSession(_ s: URLSession, webSocketTask t: URLSessionWebSocketTask,
                    didOpenWithProtocol p: String?) {
        if let i = id(t) { host?.wsEmit(i, "open", nil) }
    }

    func urlSession(_ s: URLSession, webSocketTask t: URLSessionWebSocketTask,
                    didCloseWith code: URLSessionWebSocketTask.CloseCode, reason: Data?) {
        if let i = id(t) { host?.wsEmit(i, "close", nil) }
    }

    func urlSession(_ s: URLSession, task t: URLSessionTask, didCompleteWithError error: Error?) {
        guard let i = id(t) else { return }
        if let error, (error as? URLError)?.code != .cancelled { host?.wsEmit(i, "error", nil) }
        host?.wsEmit(i, "close", nil)
    }
}

/// Streamed fetch lifecycle -> JS (044 E6b). taskDescription is
/// "<hostCall id>:<stream id>". Callbacks arrive on URLSession's queue and
/// only hop through the host (a queue.async).
nonisolated final class PipStreamDelegate: NSObject, URLSessionDataDelegate, @unchecked Sendable {
    weak var host: PipHost?

    private func ids(_ t: URLSessionTask) -> (Int, Int)? {
        let p = (t.taskDescription ?? "").split(separator: ":").compactMap { Int($0) }
        return p.count == 2 ? (p[0], p[1]) : nil
    }

    func urlSession(_ s: URLSession, dataTask t: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping (URLSession.ResponseDisposition) -> Void) {
        guard let (id, _) = ids(t) else { completionHandler(.cancel); return }
        if let http = response as? HTTPURLResponse {
            host?.streamHead(id, http)
            completionHandler(.allow)
        } else {
            host?.streamFailed(id, "fetch: not an HTTP response")
            completionHandler(.cancel)
        }
    }

    func urlSession(_ s: URLSession, dataTask t: URLSessionDataTask, didReceive data: Data) {
        if let (id, sid) = ids(t) { host?.streamEvent(id, sid, "chunk", data.base64EncodedString()) }
    }

    func urlSession(_ s: URLSession, task t: URLSessionTask, didCompleteWithError error: Error?) {
        guard let (id, sid) = ids(t) else { return }
        if let error {
            if (error as? URLError)?.code == .cancelled { return } // JS already rejected
            host?.streamFailed(id, "fetch failed: \(error.localizedDescription)")
            host?.streamEvent(id, sid, "error", error.localizedDescription)
        } else {
            host?.streamEvent(id, sid, "end", nil)
        }
    }
}
