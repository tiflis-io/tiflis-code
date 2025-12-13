//
//  MessageSplitter.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Configuration for message splitting
struct MessageSplitterConfig {
    /// Maximum height units per segment (~2 screens worth)
    /// Based on: ~25 lines per screen, so 50 units ≈ 2 screens
    let maxHeightUnitsPerSegment: Int

    /// Minimum height units to consider splitting
    let minHeightUnitsToSplit: Int

    static let `default` = MessageSplitterConfig(
        maxHeightUnitsPerSegment: 50,
        minHeightUnitsToSplit: 60
    )
}

/// Represents a segment of a split message for display
struct SplitMessageSegment: Identifiable {
    let id: String
    let messageId: String
    let contentBlocks: [MessageContentBlock]
    let segmentIndex: Int
    let totalSegments: Int
    let isFirstSegment: Bool
    let isLastSegment: Bool
    let isStreaming: Bool
    let showAvatar: Bool
    let showTimestamp: Bool
    let createdAt: Date
    let role: Message.MessageRole

    /// Is this a continuation segment (not first)?
    var isContinuation: Bool { !isFirstSegment }
}

/// Utility for splitting messages into display segments
enum MessageSplitter {

    /// Split a message into display segments based on estimated height
    static func split(
        message: Message,
        config: MessageSplitterConfig = .default
    ) -> [SplitMessageSegment] {
        // Don't split user messages
        guard message.role == .assistant else {
            return [createSingleSegment(from: message)]
        }

        // Calculate total estimated height
        let totalHeight = message.contentBlocks.reduce(0) { sum, block in
            sum + estimatedHeightUnits(of: block)
        }

        // Don't split if under threshold
        guard totalHeight >= config.minHeightUnitsToSplit else {
            return [createSingleSegment(from: message)]
        }

        // Split the message based on height units
        var segments: [[MessageContentBlock]] = []
        var currentBlocks: [MessageContentBlock] = []
        var currentHeight = 0

        for block in message.contentBlocks {
            let blockHeight = estimatedHeightUnits(of: block)

            // Check if adding this block exceeds threshold
            if currentHeight + blockHeight > config.maxHeightUnitsPerSegment && currentHeight > 0 {
                // For text blocks, try to split them if they're large
                if case .text(let id, let text) = block, blockHeight > config.maxHeightUnitsPerSegment / 2 {
                    // Flush current segment first
                    if !currentBlocks.isEmpty {
                        segments.append(currentBlocks)
                        currentBlocks = []
                        currentHeight = 0
                    }

                    // Split the large text block
                    let maxCharsPerSegment = config.maxHeightUnitsPerSegment * charsPerHeightUnit
                    let textParts = splitText(text, maxLength: maxCharsPerSegment)

                    for (index, part) in textParts.enumerated() {
                        let partBlock = MessageContentBlock.text(
                            id: "\(id)-part-\(index)",
                            text: part
                        )

                        if index < textParts.count - 1 {
                            segments.append([partBlock])
                        } else {
                            currentBlocks.append(partBlock)
                            currentHeight = estimatedHeightUnits(of: partBlock)
                        }
                    }
                    continue
                }

                // Flush current segment before adding this block
                if !currentBlocks.isEmpty {
                    segments.append(currentBlocks)
                    currentBlocks = []
                    currentHeight = 0
                }
            }

            currentBlocks.append(block)
            currentHeight += blockHeight
        }

        // Flush remaining blocks
        if !currentBlocks.isEmpty {
            segments.append(currentBlocks)
        }

        // Handle edge case: no segments created
        if segments.isEmpty {
            return [createSingleSegment(from: message)]
        }

        // Convert to SplitMessageSegment objects
        let totalSegments = segments.count
        return segments.enumerated().map { index, blocks in
            SplitMessageSegment(
                id: "\(message.id)-seg-\(index)",
                messageId: message.id,
                contentBlocks: blocks,
                segmentIndex: index,
                totalSegments: totalSegments,
                isFirstSegment: index == 0,
                isLastSegment: index == totalSegments - 1,
                isStreaming: message.isStreaming && index == totalSegments - 1,
                showAvatar: index == 0,
                showTimestamp: index == totalSegments - 1,
                createdAt: message.createdAt,
                role: message.role
            )
        }
    }

    // MARK: - Private Helpers

    private static func createSingleSegment(from message: Message) -> SplitMessageSegment {
        SplitMessageSegment(
            id: "\(message.id)-seg-0",
            messageId: message.id,
            contentBlocks: message.contentBlocks,
            segmentIndex: 0,
            totalSegments: 1,
            isFirstSegment: true,
            isLastSegment: true,
            isStreaming: message.isStreaming,
            showAvatar: message.role == .assistant,
            showTimestamp: true,
            createdAt: message.createdAt,
            role: message.role
        )
    }

    /// Approximate characters per line for height estimation
    private static let charsPerLine = 45

    /// Characters per height unit (one line = one unit)
    private static let charsPerHeightUnit = 45

    /// Estimate the height of a block in "line units"
    /// 1 unit ≈ 1 line of text height
    private static func estimatedHeightUnits(of block: MessageContentBlock) -> Int {
        switch block {
        case .text(_, let text):
            // Count actual newlines + estimate wrapped lines
            let newlines = text.components(separatedBy: "\n").count
            let estimatedWrappedLines = max(1, text.count / charsPerLine)
            return max(newlines, estimatedWrappedLines)

        case .code(_, _, let code):
            // Code blocks: actual line count + 2 for header/padding
            let lines = code.components(separatedBy: "\n").count
            return lines + 2

        case .toolCall:
            // Collapsed tool call: icon + name + status ≈ 3 lines
            return 3

        case .thinking(_, let text):
            // Collapsed by default: header only ≈ 2 lines
            // But if expanded, would be more - use collapsed estimate
            return 2

        case .status:
            // Single line with spinner
            return 1

        case .error(_, let text):
            // Error box with icon + text
            let lines = max(1, text.count / charsPerLine)
            return lines + 1

        case .cancel:
            // Cancellation notice ≈ 2 lines
            return 2

        case .voiceInput:
            // Waveform + transcription ≈ 3 lines
            return 3

        case .voiceOutput:
            // Play button + waveform ≈ 2 lines
            return 2

        case .actionButtons(_, let buttons):
            // Each button row ≈ 2 lines
            return max(1, buttons.count) * 2
        }
    }

    /// Split text at natural boundaries (paragraphs, sentences, words)
    private static func splitText(_ text: String, maxLength: Int) -> [String] {
        var parts: [String] = []
        var remaining = text

        while remaining.count > maxLength {
            let splitPoint = findBestSplitPoint(in: remaining, targetLength: maxLength)
            let part = String(remaining.prefix(splitPoint)).trimmingCharacters(in: .whitespaces)
            if !part.isEmpty {
                parts.append(part)
            }
            remaining = String(remaining.dropFirst(splitPoint)).trimmingCharacters(in: .whitespacesAndNewlines)
        }

        if !remaining.isEmpty {
            parts.append(remaining)
        }

        return parts.isEmpty ? [text] : parts
    }

    private static func findBestSplitPoint(in text: String, targetLength: Int) -> Int {
        let searchWindow = String(text.prefix(targetLength))
        let minSplit = targetLength / 2

        // Try paragraph boundary first (\n\n)
        if let range = searchWindow.range(of: "\n\n", options: .backwards) {
            let offset = searchWindow.distance(from: searchWindow.startIndex, to: range.upperBound)
            if offset > minSplit {
                return offset
            }
        }

        // Try sentence boundaries
        let sentenceDelimiters = [". ", "! ", "? ", ".\n", "!\n", "?\n"]
        for delimiter in sentenceDelimiters {
            if let range = searchWindow.range(of: delimiter, options: .backwards) {
                let offset = searchWindow.distance(from: searchWindow.startIndex, to: range.upperBound)
                if offset > minSplit {
                    return offset
                }
            }
        }

        // Try line boundary
        if let range = searchWindow.range(of: "\n", options: .backwards) {
            let offset = searchWindow.distance(from: searchWindow.startIndex, to: range.upperBound)
            if offset > minSplit {
                return offset
            }
        }

        // Try word boundary (space)
        let wordMinSplit = targetLength / 3
        if let range = searchWindow.range(of: " ", options: .backwards) {
            let offset = searchWindow.distance(from: searchWindow.startIndex, to: range.upperBound)
            if offset > wordMinSplit {
                return offset
            }
        }

        // Last resort: hard split at target length
        return targetLength
    }
}
