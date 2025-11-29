/**
 * @file chat-message.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { randomUUID } from 'crypto';

/**
 * Types of chat messages in agent conversations.
 */
export type ChatMessageType =
  | 'user'
  | 'assistant'
  | 'tool'
  | 'system'
  | 'error';

/**
 * Metadata for tool invocations.
 */
export interface ToolMetadata {
  toolName: string;
  toolInput?: unknown;
  toolOutput?: unknown;
}

/**
 * Metadata for error messages.
 */
export interface ErrorMetadata {
  errorCode?: string;
  stackTrace?: string;
}

/**
 * Metadata for system messages.
 */
export interface SystemMetadata {
  /** True when command execution is complete */
  completion?: boolean;
  /** True when context was cleared */
  contextCleared?: boolean;
}

/**
 * Metadata for assistant messages.
 */
export interface AssistantMetadata {
  /** Thinking/reasoning content (if available) */
  thinking?: string;
  /** Model name that generated the response */
  model?: string;
}

/**
 * Union type for all metadata variants.
 */
export type ChatMessageMetadata =
  | ToolMetadata
  | ErrorMetadata
  | SystemMetadata
  | AssistantMetadata
  | Record<string, unknown>;

/**
 * Represents a single message in an agent conversation.
 */
export interface ChatMessage {
  /** Unique message identifier */
  id: string;
  /** Unix timestamp (milliseconds) */
  timestamp: number;
  /** Type of message */
  type: ChatMessageType;
  /** Message content */
  content: string;
  /** Optional metadata (type-specific) */
  metadata?: ChatMessageMetadata;
}

/**
 * Creates a new chat message with auto-generated ID and timestamp.
 */
export function createChatMessage(
  type: ChatMessageType,
  content: string,
  metadata?: ChatMessageMetadata
): ChatMessage {
  return {
    id: randomUUID(),
    timestamp: Date.now(),
    type,
    content,
    metadata,
  };
}

/**
 * Creates a user message.
 */
export function createUserMessage(content: string): ChatMessage {
  return createChatMessage('user', content);
}

/**
 * Creates an assistant message.
 */
export function createAssistantMessage(
  content: string,
  metadata?: AssistantMetadata
): ChatMessage {
  return createChatMessage('assistant', content, metadata);
}

/**
 * Creates a tool invocation message.
 */
export function createToolMessage(
  toolName: string,
  toolInput?: unknown,
  toolOutput?: unknown
): ChatMessage {
  let content = `Tool: ${toolName}`;
  if (toolInput) {
    content += `\nInput: ${JSON.stringify(toolInput)}`;
  }
  if (toolOutput) {
    content += `\nOutput: ${JSON.stringify(toolOutput)}`;
  }

  return createChatMessage('tool', content, {
    toolName,
    toolInput,
    toolOutput,
  } as ToolMetadata);
}

/**
 * Creates a system message.
 */
export function createSystemMessage(
  content: string,
  metadata?: SystemMetadata
): ChatMessage {
  return createChatMessage('system', content, metadata);
}

/**
 * Creates an error message.
 */
export function createErrorMessage(
  content: string,
  metadata?: ErrorMetadata
): ChatMessage {
  return createChatMessage('error', content, metadata);
}

/**
 * Creates a completion message indicating command finished.
 */
export function createCompletionMessage(): ChatMessage {
  return createSystemMessage('Command completed', { completion: true });
}

/**
 * Creates a cancellation message.
 */
export function createCancellationMessage(): ChatMessage {
  return createSystemMessage('Command cancelled by user', { completion: true });
}

