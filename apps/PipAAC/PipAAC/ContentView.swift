//
//  ContentView.swift
//  PipAAC
//
//  Boot gate → the board. A failed boot reports the error — the db
//  file is never silently re-seeded over a family's data (043 A).
//

import SwiftUI

struct ContentView: View {
    @StateObject private var model = AppModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Group {
            if let err = model.bootError {
                VStack(spacing: 12) {
                    Text("Pip couldn't open this device's data.")
                        .font(.headline)
                    Text(err)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding()
            } else if model.surface == .picker {
                WhosTalkingView()
                    .environmentObject(model)
            } else {
                BoardView()
                    .environmentObject(model)
            }
        }
        .environment(\.wordsOnly, model.wordsOnly)
        // First run (FirstRun.swift): the welcome sits over the board like
        // the web's .welcome layer; the demo's card sits on it.
        .overlay { FirstRunHost(flow: model.firstRun).environmentObject(model) }
        .task { model.boot() }
        // Universal links: the emailed sign-in link opens here, not Safari.
        .onOpenURL { model.handleIncomingURL($0) }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            if let url = activity.webpageURL { model.handleIncomingURL(url) }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active { model.sceneBecameActive() }
        }
    }
}

#Preview {
    ContentView()
}
