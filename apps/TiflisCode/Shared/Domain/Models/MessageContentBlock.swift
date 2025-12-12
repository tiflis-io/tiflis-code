//
//  MessageContentBlock.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the Functional Source License (FSL-1.1-NC). See LICENSE file for details.
//

import Foundation

/// Represents a single content block within a message
/// Messages can contain multiple blocks of different types
enum MessageContentBlock: Identifiable, Equatable {
    case text(id: String, text: String)
    case code(id: String, language: String?, code: String)
    case toolCall(id: String, toolUseId: String?, name: String, input: String?, output: String?, status: ToolStatus)
    case thinking(id: String, text: String)
    case status(id: String, text: String)
    case error(id: String, text: String)
    case cancel(id: String, text: String)
    case voiceInput(id: String, audioURL: URL?, transcription: String?, duration: TimeInterval)
    case voiceOutput(id: String, audioURL: URL?, text: String, duration: TimeInterval)
    case actionButtons(id: String, buttons: [ActionButton])

    var id: String {
        switch self {
        case .text(let id, _),
             .code(let id, _, _),
             .toolCall(let id, _, _, _, _, _),
             .thinking(let id, _),
             .status(let id, _),
             .error(let id, _),
             .cancel(let id, _),
             .voiceInput(let id, _, _, _),
             .voiceOutput(let id, _, _, _),
             .actionButtons(let id, _):
            return id
        }
    }

    /// Returns the tool_use_id for tool calls, used for matching results with their calls
    var toolUseId: String? {
        switch self {
        case .toolCall(_, let toolUseId, _, _, _, _):
            return toolUseId
        default:
            return nil
        }
    }

    /// Check equality for Equatable conformance
    static func == (lhs: MessageContentBlock, rhs: MessageContentBlock) -> Bool {
        switch (lhs, rhs) {
        case let (.text(id1, text1), .text(id2, text2)):
            return id1 == id2 && text1 == text2
        case let (.code(id1, lang1, code1), .code(id2, lang2, code2)):
            return id1 == id2 && lang1 == lang2 && code1 == code2
        case let (.toolCall(id1, toolUseId1, name1, input1, output1, status1), .toolCall(id2, toolUseId2, name2, input2, output2, status2)):
            return id1 == id2 && toolUseId1 == toolUseId2 && name1 == name2 && input1 == input2 && output1 == output2 && status1 == status2
        case let (.thinking(id1, text1), .thinking(id2, text2)):
            return id1 == id2 && text1 == text2
        case let (.status(id1, text1), .status(id2, text2)):
            return id1 == id2 && text1 == text2
        case let (.error(id1, text1), .error(id2, text2)):
            return id1 == id2 && text1 == text2
        case let (.cancel(id1, text1), .cancel(id2, text2)):
            return id1 == id2 && text1 == text2
        case let (.voiceInput(id1, url1, trans1, dur1), .voiceInput(id2, url2, trans2, dur2)):
            return id1 == id2 && url1 == url2 && trans1 == trans2 && dur1 == dur2
        case let (.voiceOutput(id1, url1, text1, dur1), .voiceOutput(id2, url2, text2, dur2)):
            return id1 == id2 && url1 == url2 && text1 == text2 && dur1 == dur2
        case let (.actionButtons(id1, buttons1), .actionButtons(id2, buttons2)):
            return id1 == id2 && buttons1 == buttons2
        default:
            return false
        }
    }
}

// MARK: - Tool Status

/// Status of a tool call execution
enum ToolStatus: String, Codable, Equatable {
    case running
    case completed
    case failed
}

// MARK: - Action Button

/// Represents an action button that can be displayed in a message
struct ActionButton: Identifiable, Equatable, Hashable {
    let id: String
    let title: String
    let icon: String?
    let style: ActionButtonStyle
    let action: ActionType

    init(
        id: String = UUID().uuidString,
        title: String,
        icon: String? = nil,
        style: ActionButtonStyle = .secondary,
        action: ActionType
    ) {
        self.id = id
        self.title = title
        self.icon = icon
        self.style = style
        self.action = action
    }
}

/// Visual style for action buttons
enum ActionButtonStyle: String, Codable, Equatable, Hashable {
    case primary
    case secondary
    case destructive
}

/// Type of action to perform when button is tapped
enum ActionType: Equatable, Hashable {
    case sendMessage(String)
    case createSession(Session.SessionType)
    case openURL(URL)
    case custom(String)
}

// MARK: - Mock Data

extension MessageContentBlock {
    static let mockText = MessageContentBlock.text(
        id: "block-1",
        text: "I'll create a basic Express server for you."
    )

    static let mockCode = MessageContentBlock.code(
        id: "block-2",
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
    )

    static let mockToolCallRunning = MessageContentBlock.toolCall(
        id: "block-3",
        toolUseId: "toolu_mock_123",
        name: "read_file",
        input: "{\"path\": \"src/main.swift\"}",
        output: nil,
        status: .running
    )

    static let mockToolCallCompleted = MessageContentBlock.toolCall(
        id: "block-4",
        toolUseId: "toolu_mock_456",
        name: "read_file",
        input: "{\"path\": \"src/main.swift\"}",
        output: "import SwiftUI\n\n@main\nstruct MyApp: App { ... }",
        status: .completed
    )

    static let mockToolCallFailed = MessageContentBlock.toolCall(
        id: "block-5",
        toolUseId: "toolu_mock_789",
        name: "write_file",
        input: "{\"path\": \"/readonly/file.txt\"}",
        output: "Permission denied",
        status: .failed
    )

    static let mockThinking = MessageContentBlock.thinking(
        id: "block-6",
        text: "I need to analyze the project structure first. Let me check the existing files and understand the architecture before making changes."
    )

    static let mockStatus = MessageContentBlock.status(
        id: "block-7",
        text: "Reading file..."
    )

    static let mockError = MessageContentBlock.error(
        id: "block-8",
        text: "File not found: src/missing.swift"
    )

    static let mockActionButtons = MessageContentBlock.actionButtons(
        id: "block-9",
        buttons: [
            ActionButton(
                title: "Open in Cursor",
                icon: "arrow.up.right",
                style: .primary,
                action: .custom("open_cursor")
            ),
            ActionButton(
                title: "Run Tests",
                icon: "play.fill",
                style: .secondary,
                action: .custom("run_tests")
            )
        ]
    )
}
