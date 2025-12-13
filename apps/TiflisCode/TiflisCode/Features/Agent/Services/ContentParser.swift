//
//  ContentParser.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Parses agent output into structured content blocks
/// Handles different agent formats: Claude, Cursor, OpenCode, Supervisor
final class ContentParser {

    // MARK: - Public Methods

    /// Parses raw agent output into content blocks
    /// - Parameters:
    ///   - content: Raw content string from agent
    ///   - contentType: Type of content (agent, terminal, transcription)
    /// - Returns: Array of parsed content blocks
    static func parse(content: String, contentType: String) -> [MessageContentBlock] {
        switch contentType {
        case "terminal":
            return [.text(id: UUID().uuidString, text: content)]

        case "transcription":
            return [.voiceInput(id: UUID().uuidString, audioURL: nil, transcription: content, duration: 0)]

        case "agent":
            return parseAgentOutput(content)

        default:
            return [.text(id: UUID().uuidString, text: content)]
        }
    }

    /// Parses pre-structured content_blocks from the protocol (v1.2+)
    /// - Parameter blocks: Array of content block dictionaries from session.output payload
    /// - Returns: Array of parsed MessageContentBlock
    static func parseContentBlocks(_ blocks: [[String: Any]]) -> [MessageContentBlock] {
        var parsedBlocks: [MessageContentBlock] = []

        for json in blocks {
            guard let blockType = json["block_type"] as? String else {
                continue
            }
            // Skip status blocks - they are ephemeral streaming indicators
            // (e.g., "Processing...", "Complete") that shouldn't be persisted
            // Note: Cancellation messages now use dedicated "cancel" block type
            if blockType == "status" {
                continue
            }
            // For text blocks, parse markdown code blocks inside
            if blockType == "text", let content = json["content"] as? String {
                parsedBlocks.append(contentsOf: parseTextWithCodeBlocks(content))
                continue
            }
            if let block = parseTypedBlock(blockType: blockType, json: json) {
                parsedBlocks.append(block)
            }
        }

        // Merge tool blocks that have the same tool_use_id
        // This handles the case where input and output come as separate blocks
        return mergeToolBlocks(parsedBlocks)
    }

    /// Merges tool blocks that have the same tool_use_id
    /// When a tool_use event comes first (with input), and tool_result comes later (with output),
    /// they should be displayed as a single unified block
    private static func mergeToolBlocks(_ blocks: [MessageContentBlock]) -> [MessageContentBlock] {
        var result: [MessageContentBlock] = []
        var toolBlocksByUseId: [String: Int] = [:] // Maps tool_use_id to index in result

        for block in blocks {
            switch block {
            case .toolCall(_, let toolUseId, let name, let input, let output, let status):
                // If we have a tool_use_id, try to merge with existing block
                if let useId = toolUseId, !useId.isEmpty {
                    if let existingIndex = toolBlocksByUseId[useId] {
                        // Found existing block with same tool_use_id - merge them
                        if case .toolCall(let existingId, _, let existingName, let existingInput, let existingOutput, let existingStatus) = result[existingIndex] {
                            // Merge: prefer non-nil values, use latest status if output is present
                            let mergedName = name != "unknown" && name != "tool" ? name : existingName
                            let mergedInput = input ?? existingInput
                            let mergedOutput = output ?? existingOutput
                            // If we have output now, use the current status (completed/failed)
                            // Otherwise keep existing status
                            let mergedStatus = output != nil ? status : existingStatus

                            result[existingIndex] = .toolCall(
                                id: existingId,
                                toolUseId: useId,
                                name: mergedName,
                                input: mergedInput,
                                output: mergedOutput,
                                status: mergedStatus
                            )
                        }
                    } else {
                        // First occurrence of this tool_use_id
                        toolBlocksByUseId[useId] = result.count
                        result.append(block)
                    }
                } else {
                    // No tool_use_id, just append
                    result.append(block)
                }

            default:
                result.append(block)
            }
        }

        return result
    }

    /// Parses a streaming JSON line from agent
    /// - Parameter jsonLine: Single line of JSON from agent stream
    /// - Returns: Parsed content block if applicable
    static func parseStreamingLine(_ jsonLine: String) -> MessageContentBlock? {
        guard let data = jsonLine.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }

        return parseAgentJSON(json)
    }

    // MARK: - Agent Output Parsing

    /// Parses agent output which may contain multiple blocks
    private static func parseAgentOutput(_ content: String) -> [MessageContentBlock] {
        var blocks: [MessageContentBlock] = []

        // Try to parse as JSON first (structured agent output)
        if let data = content.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
           let block = parseAgentJSON(json) {
            return [block]
        }

        // Parse as mixed text with code blocks
        blocks = parseTextWithCodeBlocks(content)

        return blocks.isEmpty ? [.text(id: UUID().uuidString, text: content)] : blocks
    }

    /// Parses JSON from structured agent output
    private static func parseAgentJSON(_ json: [String: Any]) -> MessageContentBlock? {
        // Check for block_type field (future protocol enhancement)
        if let blockType = json["block_type"] as? String {
            return parseTypedBlock(blockType: blockType, json: json)
        }

        // Check for tool call format
        if let toolName = json["tool"] as? String ?? json["name"] as? String {
            return parseToolCall(toolName: toolName, json: json)
        }

        // Check for thinking format
        if let thinking = json["thinking"] as? String {
            return .thinking(id: UUID().uuidString, text: thinking)
        }

        // Check for error format
        if let error = json["error"] as? String {
            return .error(id: UUID().uuidString, text: error)
        }

        // Check for status format
        if let status = json["status"] as? String {
            return .status(id: UUID().uuidString, text: status)
        }

        // Check for content/text
        if let text = json["content"] as? String ?? json["text"] as? String {
            return .text(id: UUID().uuidString, text: text)
        }

        return nil
    }

    /// Parses a typed block from JSON (future protocol format)
    private static func parseTypedBlock(blockType: String, json: [String: Any]) -> MessageContentBlock? {
        let metadata = json["metadata"] as? [String: Any] ?? [:]

        switch blockType {
        case "text":
            let text = json["content"] as? String ?? ""
            return .text(id: UUID().uuidString, text: text)

        case "code":
            let code = json["content"] as? String ?? ""
            let language = metadata["language"] as? String
            return .code(id: UUID().uuidString, language: language, code: code)

        case "tool":
            let name = metadata["tool_name"] as? String ?? "unknown"
            let toolUseId = metadata["tool_use_id"] as? String
            let input = metadata["tool_input"] as? String
            let output = metadata["tool_output"] as? String
            // Default to 'completed' if status not specified - history data should be completed
            // Only streaming blocks should have 'running' status (and they explicitly set it)
            let statusStr = metadata["tool_status"] as? String ?? "completed"
            let status = ToolStatus(rawValue: statusStr) ?? .completed
            return .toolCall(id: UUID().uuidString, toolUseId: toolUseId, name: name, input: input, output: output, status: status)

        case "thinking":
            let text = json["content"] as? String ?? ""
            return .thinking(id: UUID().uuidString, text: text)

        case "status":
            let text = json["content"] as? String ?? ""
            return .status(id: UUID().uuidString, text: text)

        case "error":
            let text = json["content"] as? String ?? ""
            return .error(id: UUID().uuidString, text: text)

        case "cancel":
            let text = json["content"] as? String ?? ""
            return .cancel(id: UUID().uuidString, text: text)

        case "voice_input":
            let transcription = json["content"] as? String
            let duration = metadata["duration"] as? TimeInterval ?? 0
            let audioUrl = metadata["audio_url"] as? String
            let audioBase64 = metadata["audio_base64"] as? String

            // Generate a unique ID for this voice input (used for audio cache lookup)
            let voiceInputId = UUID().uuidString

            // If audio_base64 is present, cache it in AudioPlayerService for replay
            if let audioBase64 = audioBase64,
               let audioData = Data(base64Encoded: audioBase64) {
                Task { @MainActor in
                    AudioPlayerService.shared.playAudio(data: audioData, messageId: voiceInputId, autoPlay: false)
                }
            }

            return .voiceInput(
                id: voiceInputId,
                audioURL: audioUrl != nil ? URL(string: audioUrl!) : nil,
                transcription: transcription,
                duration: duration
            )

        case "voice_output":
            let messageId = metadata["message_id"] as? String ?? UUID().uuidString
            let audioBase64 = metadata["audio_base64"] as? String
            let duration = metadata["duration"] as? TimeInterval ?? 0

            // If audio_base64 is present, cache it in AudioPlayerService for replay
            if let audioBase64 = audioBase64,
               let audioData = Data(base64Encoded: audioBase64) {
                // Schedule audio caching on MainActor
                Task { @MainActor in
                    AudioPlayerService.shared.playAudio(data: audioData, messageId: messageId, autoPlay: false)
                }
            }

            return .voiceOutput(
                id: UUID().uuidString,
                audioURL: nil,
                text: messageId,  // Store messageId in text field for audio lookup
                duration: duration
            )

        default:
            return nil
        }
    }

    /// Parses tool call from JSON
    private static func parseToolCall(toolName: String, json: [String: Any]) -> MessageContentBlock {
        let input: String?
        if let inputObj = json["input"] ?? json["arguments"] {
            if let inputStr = inputObj as? String {
                input = inputStr
            } else if let inputDict = inputObj as? [String: Any],
                      let data = try? JSONSerialization.data(withJSONObject: inputDict, options: .prettyPrinted),
                      let str = String(data: data, encoding: .utf8) {
                input = str
            } else {
                input = nil
            }
        } else {
            input = nil
        }

        let output: String?
        if let outputObj = json["output"] ?? json["result"] {
            if let outputStr = outputObj as? String {
                output = outputStr
            } else if let outputDict = outputObj as? [String: Any],
                      let data = try? JSONSerialization.data(withJSONObject: outputDict, options: .prettyPrinted),
                      let str = String(data: data, encoding: .utf8) {
                output = str
            } else {
                output = nil
            }
        } else {
            output = nil
        }

        // Infer status: if output exists and no explicit status, assume completed
        let statusStr = json["status"] as? String ?? (output != nil ? "completed" : "running")
        let status = ToolStatus(rawValue: statusStr) ?? (output != nil ? .completed : .running)

        return .toolCall(id: UUID().uuidString, toolUseId: nil, name: toolName, input: input, output: output, status: status)
    }

    // MARK: - Text and Code Block Parsing

    /// Parses text content that may contain markdown code blocks
    private static func parseTextWithCodeBlocks(_ content: String) -> [MessageContentBlock] {
        var blocks: [MessageContentBlock] = []

        // Pattern for fenced code blocks: ```language\ncode\n```
        let codeBlockPattern = "```([a-zA-Z0-9]*)?\\n([\\s\\S]*?)```"

        guard let regex = try? NSRegularExpression(pattern: codeBlockPattern, options: []) else {
            return [.text(id: UUID().uuidString, text: content)]
        }

        let nsContent = content as NSString
        let matches = regex.matches(in: content, options: [], range: NSRange(location: 0, length: nsContent.length))

        if matches.isEmpty {
            // No code blocks, return as plain text
            let trimmed = content.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return [.text(id: UUID().uuidString, text: content)]
            }
            return []
        }

        var lastEnd = 0

        for match in matches {
            // Text before this code block
            if match.range.location > lastEnd {
                let textRange = NSRange(location: lastEnd, length: match.range.location - lastEnd)
                let textBefore = nsContent.substring(with: textRange).trimmingCharacters(in: .whitespacesAndNewlines)
                if !textBefore.isEmpty {
                    blocks.append(.text(id: UUID().uuidString, text: textBefore))
                }
            }

            // Extract language and code
            var language: String?
            if match.numberOfRanges > 1 && match.range(at: 1).location != NSNotFound {
                let langRange = match.range(at: 1)
                let lang = nsContent.substring(with: langRange)
                if !lang.isEmpty {
                    language = lang
                }
            }

            var code = ""
            if match.numberOfRanges > 2 && match.range(at: 2).location != NSNotFound {
                let codeRange = match.range(at: 2)
                code = nsContent.substring(with: codeRange)
            }

            blocks.append(.code(id: UUID().uuidString, language: language, code: code))

            lastEnd = match.range.location + match.range.length
        }

        // Text after last code block
        if lastEnd < nsContent.length {
            let textRange = NSRange(location: lastEnd, length: nsContent.length - lastEnd)
            let textAfter = nsContent.substring(with: textRange).trimmingCharacters(in: .whitespacesAndNewlines)
            if !textAfter.isEmpty {
                blocks.append(.text(id: UUID().uuidString, text: textAfter))
            }
        }

        return blocks
    }

    // MARK: - Tool Call Detection Patterns

    /// Common patterns for tool call detection in streaming output
    private static let toolCallPatterns: [(name: String, pattern: String)] = [
        ("read_file", "Reading file"),
        ("write_file", "Writing file"),
        ("edit_file", "Editing file"),
        ("bash", "Running command"),
        ("search", "Searching"),
        ("list_directory", "Listing directory"),
        ("create_file", "Creating file"),
        ("delete_file", "Deleting file")
    ]

    /// Detects if text indicates a tool call status
    static func detectToolCallStatus(_ text: String) -> (name: String, status: ToolStatus)? {
        let lowercased = text.lowercased()

        for (name, pattern) in toolCallPatterns {
            if lowercased.contains(pattern.lowercased()) {
                return (name, .running)
            }
        }

        return nil
    }

    // MARK: - Supervisor Output Parsing

    /// Parses supervisor agent specific output (LangGraph)
    static func parseSupervisorOutput(_ content: String) -> [MessageContentBlock] {
        // Try JSON first
        if let data = content.data(using: .utf8),
           let json = try? JSONSerialization.jsonObject(with: data) {

            // Handle array of steps
            if let steps = json as? [[String: Any]] {
                return steps.compactMap { parseAgentJSON($0) }
            }

            // Handle single step
            if let dict = json as? [String: Any] {
                if let block = parseAgentJSON(dict) {
                    return [block]
                }
            }
        }

        // Fallback to text parsing
        return parseAgentOutput(content)
    }

    // MARK: - Action Button Parsing

    /// Parses action buttons from JSON
    static func parseActionButtons(_ json: [[String: Any]]) -> [ActionButton] {
        return json.compactMap { buttonJson -> ActionButton? in
            guard let title = buttonJson["title"] as? String else { return nil }

            let icon = buttonJson["icon"] as? String
            let styleStr = buttonJson["style"] as? String ?? "secondary"
            let style = ActionButtonStyle(rawValue: styleStr) ?? .secondary

            let action: ActionType
            if let actionStr = buttonJson["action"] as? String {
                if actionStr.hasPrefix("send:") {
                    let message = String(actionStr.dropFirst(5))
                    action = .sendMessage(message)
                } else if actionStr.hasPrefix("url:") {
                    let urlStr = String(actionStr.dropFirst(4))
                    if let url = URL(string: urlStr) {
                        action = .openURL(url)
                    } else {
                        action = .custom(actionStr)
                    }
                } else if actionStr.hasPrefix("session:") {
                    let typeStr = String(actionStr.dropFirst(8))
                    if let sessionType = Session.SessionType(string: typeStr) {
                        action = .createSession(sessionType)
                    } else {
                        action = .custom(actionStr)
                    }
                } else {
                    action = .custom(actionStr)
                }
            } else {
                action = .custom(title)
            }

            return ActionButton(title: title, icon: icon, style: style, action: action)
        }
    }
}

// MARK: - SessionType Extension for Parsing

extension Session.SessionType {
    init?(string: String) {
        switch string.lowercased() {
        case "cursor":
            self = .cursor
        case "claude":
            self = .claude
        case "opencode":
            self = .opencode
        case "terminal":
            self = .terminal
        case "supervisor":
            self = .supervisor
        default:
            return nil
        }
    }
}
