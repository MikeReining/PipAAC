//
//  PipAAC-Bridging-Header.h
//  PipAAC
//
//  Exposes the vendored SQLite amalgamation to Swift. Vendored, not the
//  system library: the web app runs @sqlite.org/sqlite-wasm 3.53.4, and
//  the shared core must see the same engine everywhere (phase 044 § 6).
//  Source: sqlite-amalgamation-3530400.zip, sqlite.org/2026/, published
//  SHA3-256 628a44cfe82c66aed1ccbbe85a562d2e33ebe64b3288981ed76285612227934e.
//

#ifndef PipAAC_Bridging_Header_h
#define PipAAC_Bridging_Header_h

#import "sqlite3.h"

#endif /* PipAAC_Bridging_Header_h */
