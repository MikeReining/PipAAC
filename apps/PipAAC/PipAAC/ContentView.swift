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
            } else {
                BoardView()
                    .environmentObject(model)
            }
        }
        .task { model.boot() }
    }
}

#Preview {
    ContentView()
}
