//
//  Message.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation

/// Represents a chat message in a session
struct Message: Identifiable, Equatable {
    let id: String
    let sessionId: String
    let role: MessageRole
    let content: String
    let contentType: ContentType
    let isComplete: Bool
    let createdAt: Date
    let audioInputPath: String?
    let audioOutputPath: String?
    
    enum MessageRole: String, Codable {
        case user
        case assistant
        case system
    }
    
    enum ContentType: String, Codable {
        case text
        case audio
        case transcription
    }
    
    init(
        id: String = UUID().uuidString,
        sessionId: String,
        role: MessageRole,
        content: String,
        contentType: ContentType = .text,
        isComplete: Bool = true,
        createdAt: Date = Date(),
        audioInputPath: String? = nil,
        audioOutputPath: String? = nil
    ) {
        self.id = id
        self.sessionId = sessionId
        self.role = role
        self.content = content
        self.contentType = contentType
        self.isComplete = isComplete
        self.createdAt = createdAt
        self.audioInputPath = audioInputPath
        self.audioOutputPath = audioOutputPath
    }
}

// MARK: - Mock Data for Previews

extension Message {
    static let mockUserMessage = Message(
        sessionId: "session-1",
        role: .user,
        content: "Create a new TypeScript file with a basic Express server"
    )
    
    static let mockAssistantMessage = Message(
        sessionId: "session-1",
        role: .assistant,
        content: """
        I'll create a basic Express server for you. Let me set up the file with TypeScript configuration.
        
        ```typescript
        import express from 'express';
        
        const app = express();
        const port = 3000;
        
        app.get('/', (req, res) => {
          res.send('Hello World!');
        });
        
        app.listen(port, () => {
          console.log(`Server running at http://localhost:${port}`);
        });
        ```
        
        I've created the file at `src/server.ts`. Would you like me to add any additional middleware or routes?
        """
    )
    
    static let mockStreamingMessage = Message(
        sessionId: "session-1",
        role: .assistant,
        content: "I'm analyzing your codebase to understand the project structure...",
        isComplete: false
    )
}

