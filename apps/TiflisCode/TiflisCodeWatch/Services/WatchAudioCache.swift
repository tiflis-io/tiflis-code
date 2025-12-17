//
//  WatchAudioCache.swift
//  TiflisCodeWatch
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Thread-safe in-memory cache for TTS audio data on watchOS
/// Allows replaying voice output from messages
/// Uses actor isolation for concurrency safety
actor WatchAudioCache {
    static let shared = WatchAudioCache()

    /// Maximum number of audio clips to cache (memory constraint on watchOS)
    private let maxCacheSize = 10

    /// Cache storage: audioId -> audioData
    private var cache: [String: Data] = [:]

    /// Order of insertion for LRU eviction
    private var insertionOrder: [String] = []

    private init() {}

    /// Store audio data with an ID
    func store(_ data: Data, forId id: String) {
        // Evict oldest if at capacity
        if cache.count >= maxCacheSize {
            if let oldest = insertionOrder.first {
                cache.removeValue(forKey: oldest)
                insertionOrder.removeFirst()
            }
        }

        cache[id] = data
        insertionOrder.append(id)
    }

    /// Retrieve audio data by ID
    func retrieve(forId id: String) -> Data? {
        return cache[id]
    }

    /// Clear all cached audio
    func clearAll() {
        cache.removeAll()
        insertionOrder.removeAll()
    }
}
