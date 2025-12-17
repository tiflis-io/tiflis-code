//
//  Message.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Represents a chat message in a session
struct Message: Identifiable, Equatable {
    let id: String
    let sessionId: String
    let role: MessageRole
    var contentBlocks: [MessageContentBlock]
    var isStreaming: Bool
    let createdAt: Date

    enum MessageRole: String, Codable {
        case user
        case assistant
        case system
    }

    /// Legacy content type for backward compatibility
    enum ContentType: String, Codable {
        case text
        case audio
        case transcription
    }

    init(
        id: String = UUID().uuidString,
        sessionId: String,
        role: MessageRole,
        contentBlocks: [MessageContentBlock] = [],
        isStreaming: Bool = false,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.sessionId = sessionId
        self.role = role
        self.contentBlocks = contentBlocks
        self.isStreaming = isStreaming
        self.createdAt = createdAt
    }

    /// Convenience initializer for simple text messages
    init(
        id: String = UUID().uuidString,
        sessionId: String,
        role: MessageRole,
        content: String,
        isStreaming: Bool = false,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.sessionId = sessionId
        self.role = role
        self.contentBlocks = [MessageContentBlock.text(id: UUID().uuidString, text: content)]
        self.isStreaming = isStreaming
        self.createdAt = createdAt
    }

    // MARK: - Computed Properties

    /// Extracts plain text content from all text blocks
    var textContent: String {
        contentBlocks.compactMap {
            if case .text(_, let text) = $0 { return text }
            return nil
        }.joined(separator: "\n")
    }

    /// Checks if message contains any code blocks
    var hasCodeBlocks: Bool {
        contentBlocks.contains {
            if case .code = $0 { return true }
            return false
        }
    }

    /// Checks if message contains any tool calls
    var hasToolCalls: Bool {
        contentBlocks.contains {
            if case .toolCall = $0 { return true }
            return false
        }
    }

    /// Checks if message contains thinking blocks
    var hasThinking: Bool {
        contentBlocks.contains {
            if case .thinking = $0 { return true }
            return false
        }
    }

    /// Returns first voice input block if present
    var voiceInput: (audioURL: URL?, transcription: String?, duration: TimeInterval)? {
        for block in contentBlocks {
            if case .voiceInput(_, let url, let trans, let dur) = block {
                return (url, trans, dur)
            }
        }
        return nil
    }

    /// Returns first voice output block if present
    /// The `id` is the unique audio identifier used for playback state tracking
    var voiceOutput: (id: String, audioURL: URL?, text: String, duration: TimeInterval)? {
        for block in contentBlocks {
            if case .voiceOutput(let id, let url, let text, let dur) = block {
                return (id, url, text, dur)
            }
        }
        return nil
    }

    // MARK: - Mutating Methods

    /// Updates the last text block with new content (for streaming)
    mutating func updateStreamingText(_ text: String) {
        if let lastIndex = contentBlocks.lastIndex(where: {
            if case .text = $0 { return true }
            return false
        }) {
            if case .text(let id, _) = contentBlocks[lastIndex] {
                contentBlocks[lastIndex] = MessageContentBlock.text(id: id, text: text)
            }
        } else {
            contentBlocks.append(MessageContentBlock.text(id: UUID().uuidString, text: text))
        }
    }

    /// Appends a new content block
    mutating func appendBlock(_ block: MessageContentBlock) {
        contentBlocks.append(block)
    }

    /// Updates a tool call status by ID
    mutating func updateToolCallStatus(blockId: String, output: String?, status: ToolStatus) {
        if let index = contentBlocks.firstIndex(where: { $0.id == blockId }) {
            if case .toolCall(let id, let toolUseId, let name, let input, _, _) = contentBlocks[index] {
                contentBlocks[index] = MessageContentBlock.toolCall(id: id, toolUseId: toolUseId, name: name, input: input, output: output, status: status)
            }
        }
    }
}

// MARK: - Mock Data for Previews

extension Message {
    static let mockUserMessage = Message(
        sessionId: "session-1",
        role: .user,
        content: "Create a new TypeScript file with a basic Express server"
    )

    static let mockAssistantMessage: Message = {
        let blocks: [MessageContentBlock] = [
            .text(id: "b1", text: "I'll create a basic Express server for you. Let me set up the file with TypeScript configuration."),
            .code(
                id: "b2",
                language: "typescript",
                code: """
                import express from 'express';

                const app = express();
                const port = 3000;

                app.get('/', (req, res) => {
                  res.send('Hello World!');
                });

                app.listen(port, () => {
                  console.log(`Server running at http://localhost:${port}`);
                });
                """
            ),
            .text(id: "b3", text: "I've created the file at `src/server.ts`. Would you like me to add any additional middleware or routes?")
        ]
        return Message(
            sessionId: "session-1",
            role: .assistant,
            contentBlocks: blocks
        )
    }()

    static let mockStreamingMessage = Message(
        sessionId: "session-1",
        role: .assistant,
        content: "I'm analyzing your codebase to understand the project structure...",
        isStreaming: true
    )

    static let mockMessageWithToolCalls: Message = {
        let blocks: [MessageContentBlock] = [
            .status(id: "s1", text: "Analyzing project structure..."),
            .toolCall(
                id: "t1",
                toolUseId: "toolu_mock_001",
                name: "read_file",
                input: "{\"path\": \"package.json\"}",
                output: "{\"name\": \"my-app\", \"version\": \"1.0.0\"}",
                status: .completed
            ),
            .thinking(id: "th1", text: "I can see this is a Node.js project. Let me check the main entry point."),
            .toolCall(
                id: "t2",
                toolUseId: "toolu_mock_002",
                name: "read_file",
                input: "{\"path\": \"src/index.ts\"}",
                output: nil,
                status: .running
            )
        ]
        return Message(
            sessionId: "session-1",
            role: .assistant,
            contentBlocks: blocks,
            isStreaming: true
        )
    }()

    static let mockMessageWithError: Message = {
        let blocks: [MessageContentBlock] = [
            .text(id: "e1", text: "I tried to read the configuration file, but encountered an error:"),
            .error(id: "e2", text: "File not found: config/settings.json"),
            .text(id: "e3", text: "Would you like me to create this file for you?"),
            .actionButtons(id: "a1", buttons: [
                ActionButton(title: "Create File", icon: "plus.circle", style: .primary, action: .custom("create_config")),
                ActionButton(title: "Skip", icon: "xmark", style: .secondary, action: .custom("skip"))
            ])
        ]
        return Message(
            sessionId: "session-1",
            role: .assistant,
            contentBlocks: blocks
        )
    }()
}
