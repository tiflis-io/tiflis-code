//
//  ChatViewModel.swift
//  TiflisCode
//
//  Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
//  Licensed under the MIT License. See LICENSE file for details.
//

import Foundation

/// ViewModel for ChatView managing messages and interactions
@MainActor
final class ChatViewModel: ObservableObject {
    let session: Session
    
    @Published var messages: [Message] = []
    @Published var inputText = ""
    @Published var isRecording = false
    @Published var isLoading = false
    @Published var error: String?
    
    init(session: Session) {
        self.session = session
        loadMockMessages()
    }
    
    // MARK: - Actions
    
    func sendMessage() {
        guard !inputText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            return
        }
        
        let userMessage = Message(
            sessionId: session.id,
            role: .user,
            content: inputText
        )
        messages.append(userMessage)
        inputText = ""
        
        // Simulate response
        simulateAssistantResponse()
    }
    
    func startRecording() {
        isRecording = true
    }
    
    func stopRecording() {
        isRecording = false
        
        // Simulate transcription
        let transcribedMessage = Message(
            sessionId: session.id,
            role: .user,
            content: "Create a new component for handling user authentication",
            contentType: .transcription
        )
        messages.append(transcribedMessage)
        
        simulateAssistantResponse()
    }
    
    func clearContext() {
        messages.removeAll()
    }
    
    // MARK: - Private
    
    private func loadMockMessages() {
        if session.type == .supervisor {
            messages = [
                Message(
                    sessionId: session.id,
                    role: .assistant,
                    content: "Hello! I'm your Supervisor agent. I can help you manage your coding sessions, create new agent instances, and navigate your workspace. What would you like to do?"
                )
            ]
        } else {
            messages = [
                Message.mockUserMessage,
                Message.mockAssistantMessage
            ]
        }
    }
    
    private func simulateAssistantResponse() {
        isLoading = true
        
        Task {
            // Simulate streaming delay
            try? await Task.sleep(for: .seconds(1))
            
            let response = Message(
                sessionId: session.id,
                role: .assistant,
                content: generateMockResponse(),
                isComplete: false
            )
            messages.append(response)
            
            // Simulate streaming completion
            try? await Task.sleep(for: .seconds(0.5))
            
            if let index = messages.firstIndex(where: { $0.id == response.id }) {
                messages[index] = Message(
                    id: response.id,
                    sessionId: session.id,
                    role: .assistant,
                    content: response.content,
                    isComplete: true,
                    createdAt: response.createdAt
                )
            }
            
            isLoading = false
        }
    }
    
    private func generateMockResponse() -> String {
        let responses = [
            "I've analyzed your request and I'm working on it. Let me create the necessary files and update the codebase accordingly.",
            "Got it! I'll implement that feature for you. First, let me check the existing code structure to ensure compatibility.",
            "Excellent choice! I'm now generating the code. This will include proper error handling and type safety.",
            "I understand. Let me search through the codebase to find the best approach for this implementation."
        ]
        return responses.randomElement() ?? responses[0]
    }
}

// MARK: - Mock for Previews

extension ChatViewModel {
    static var mock: ChatViewModel {
        let viewModel = ChatViewModel(session: .mockClaudeSession)
        viewModel.messages = [
            .mockUserMessage,
            .mockAssistantMessage
        ]
        return viewModel
    }
}

