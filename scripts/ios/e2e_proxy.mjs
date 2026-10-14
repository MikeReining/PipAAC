/**
 * A switchable relay in front of the local Worker, for the 044 C4 media E2E
 * (local only; no paid API). It forwards HTTP and WebSocket traffic and
 * obeys a one-word control file, read on every request:
 *
 *   pass        forward everything (the default; a missing file = pass)
 *   cut-blobs   a GET /blobs/<sha> answers with the first half of its body
 *               and then the connection dies - a download interrupted
 *               mid-transfer. Every cut is appended to <ctl>.log.
 *   down        the relay is gone: new connections die at once and every
 *               open one (the WebSocket too) is destroyed when the file
 *               flips to `down`.
 *
 *   node scripts/ios/e2e_proxy.mjs <workerPort> <controlFile> <portFile>
 */
import { appendFileSync, readFileSync, watchFile, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";

const [targetArg, ctl, portFile] = process.argv.slice(2);
const target = Number(targetArg);
const mode = () => { try { return readFileSync(ctl, "utf8").trim() || "pass"; } catch { return "pass"; } };
const live = new Set();
const track = (s) => { live.add(s); s.on("close", () => live.delete(s)); s.on("error", () => {}); };

const server = http.createServer((req, res) => {
  const m = mode();
  if (m === "down") { req.socket.destroy(); return; }
  const cut = m === "cut-blobs" && req.method === "GET" && req.url.includes("/blobs/");
  const up = http.request({ host: "127.0.0.1", port: target, method: req.method, path: req.url,
    headers: req.headers, agent: false }, (ur) => {
    res.writeHead(ur.statusCode, ur.headers);
    if (!cut || ur.statusCode !== 200) { ur.pipe(res); return; }
    let sent = false;
    ur.on("data", (chunk) => {
      if (sent) return;
      sent = true;
      res.write(chunk.subarray(0, Math.max(1, chunk.length >> 1)));
      appendFileSync(`${ctl}.log`, `CUT ${req.url} after ${Math.max(1, chunk.length >> 1)} of ${ur.headers["content-length"] ?? "?"} bytes\n`);
      setTimeout(() => req.socket.destroy(), 50);
      up.destroy();
    });
  });
  up.on("error", () => req.socket.destroy());
  req.pipe(up);
});
server.on("connection", track);

server.on("upgrade", (req, sock, head) => {
  if (mode() === "down") { sock.destroy(); return; }
  track(sock);
  const up = net.connect(target, "127.0.0.1", () => {
    let raw = `${req.method} ${req.url} HTTP/1.1\r\n`;
    for (let i = 0; i < req.rawHeaders.length; i += 2) raw += `${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`;
    up.write(raw + "\r\n");
    if (head?.length) up.write(head);
    sock.pipe(up);
    up.pipe(sock);
  });
  track(up);
  up.on("error", () => sock.destroy());
  sock.on("close", () => up.destroy());
  up.on("close", () => sock.destroy());
});

let last = mode();
watchFile(ctl, { interval: 100 }, () => {
  const m = mode();
  if (m === "down" && last !== "down") for (const s of live) s.destroy();
  last = m;
});

server.listen(0, "127.0.0.1", () => {
  writeFileSync(portFile, String(server.address().port));
});
