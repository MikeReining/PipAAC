//
//  Item.swift
//  PipAAC
//
//  Created by Michael Reining on 2026-10-06.
//

import Foundation
import SwiftData

@Model
final class Item {
    var timestamp: Date
    
    init(timestamp: Date) {
        self.timestamp = timestamp
    }
}
