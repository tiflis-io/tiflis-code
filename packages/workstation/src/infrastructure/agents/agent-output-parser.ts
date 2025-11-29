/**
 * @file agent-output-parser.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 *
 * Parses JSON stream output from headless CLI agents (cursor-agent, claude)
 * and converts to structured ChatMessage objects.
 */

import {
  type ChatMessage,
  type ChatMessageType,
  createChatMessage,
} from '../../domain/value-objects/chat-message.js';
import { AGENT_EXECUTION_CONFIG } from '../../config/constants.js';

/**
 * Result of parsing a single JSON line.
 */
export interface ParseResult {
  /** Parsed chat message (null if not a displayable message) */
  message: ChatMessage | null;
  /** Session ID extracted from the message */
  sessionId: string | null;
  /** True if this message indicates command completion */
  isComplete: boolean;
}

/**
 * Parses JSON stream output from headless terminals and converts to ChatMessage objects.
 *
 * Supports both cursor-agent and claude CLI output formats.
 */
export class AgentOutputParser {
  /**
   * Parse a single JSON line and convert to ChatMessage.
   *
   * @param jsonLine - Single line of JSON output from agent CLI
   * @returns Parsed message, session ID, and completion status
   */
  parseLine(jsonLine: string): ParseResult {
    const trimmed = jsonLine.trim();

    if (!trimmed) {
      return { message: null, sessionId: null, isComplete: false };
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);

      // Validate it's an object
      if (typeof parsed !== 'object' || parsed === null) {
        return { message: null, sessionId: null, isComplete: false };
      }

      const payload = parsed as Record<string, unknown>;

      // Extract session_id from various locations
      const sessionId = this.extractSessionId(payload);

      // Check if this is a completion message
      const messageType = payload.type as string | undefined;
      const completionTypes: readonly string[] = AGENT_EXECUTION_CONFIG.COMPLETION_TYPES;
      const isComplete = messageType !== undefined && completionTypes.includes(messageType);

      if (isComplete) {
        return { message: null, sessionId, isComplete: true };
      }

      // Map to ChatMessage
      const message = this.mapToChatMessage(payload);

      return { message, sessionId, isComplete: false };
    } catch {
      // Not valid JSON, skip gracefully
      // This can happen with partial lines or non-JSON output
      return { message: null, sessionId: null, isComplete: false };
    }
  }

  /**
   * Parse multiple lines (buffer) and return all parsed results.
   *
   * @param buffer - Multi-line string buffer
   * @returns Array of parse results and remaining incomplete line
   */
  parseBuffer(buffer: string): {
    results: ParseResult[];
    remaining: string;
  } {
    const lines = buffer.split('\n');
    const remaining = lines.pop() ?? ''; // Keep incomplete line
    const results: ParseResult[] = [];

    for (const line of lines) {
      const result = this.parseLine(line);
      if (result.message || result.sessionId || result.isComplete) {
        results.push(result);
      }
    }

    return { results, remaining };
  }

  /**
   * Map JSON payload to ChatMessage.
   */
  private mapToChatMessage(payload: Record<string, unknown>): ChatMessage | null {
    const messageType = this.determineMessageType(payload);
    if (!messageType) {
      return null; // Unknown or unsupported message type
    }

    const content = this.extractContent(payload, messageType);
    if (!content) {
      return null; // No content to display
    }

    const metadata = this.extractMetadata(payload, messageType);

    return createChatMessage(messageType, content, metadata);
  }

  /**
   * Determine ChatMessage type from JSON payload.
   * Supports both cursor-agent and claude CLI formats.
   */
  private determineMessageType(
    payload: Record<string, unknown>
  ): ChatMessageType | null {
    const type = payload.type as string | undefined;
    const role = payload.role as string | undefined;

    // Handle cursor-agent format
    if (type === 'user') return 'user';
    if (type === 'assistant') return 'assistant';
    if (type === 'tool' || payload.tool_name) return 'tool';
    if (type?.startsWith('system/') || type === 'system') return 'system';
    if (type === 'error' || payload.error) return 'error';

    // Handle claude CLI format
    if (role === 'user') return 'user';
    if (role === 'assistant') return 'assistant';
    if (type === 'tool_use' || type === 'tool_result') return 'tool';
    if (type === 'message' && role) {
      return role === 'user' ? 'user' : 'assistant';
    }

    // Handle content_block_delta (streaming chunks)
    if (type === 'content_block_delta') {
      return 'assistant';
    }

    return null;
  }

  /**
   * Extract content text from payload based on message type.
   */
  private extractContent(
    payload: Record<string, unknown>,
    messageType: ChatMessageType
  ): string | null {
    switch (messageType) {
      case 'user':
        return this.extractTextContent(payload);

      case 'assistant':
        return this.extractAssistantContent(payload);

      case 'tool':
        return this.extractToolContent(payload);

      case 'system':
        return this.extractSystemContent(payload);

      case 'error':
        return this.extractErrorContent(payload);

      default:
        return null;
    }
  }

  /**
   * Extract text content from user/assistant messages.
   */
  private extractTextContent(payload: Record<string, unknown>): string | null {
    const content = payload.content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return this.extractFromContentBlocks(content);
    }

    return null;
  }

  /**
   * Extract assistant message content (supports various formats).
   */
  private extractAssistantContent(payload: Record<string, unknown>): string | null {
    // Cursor format: payload.message.content (array of blocks)
    const message = payload.message as Record<string, unknown> | undefined;
    if (message?.content) {
      const content = message.content;
      if (Array.isArray(content)) {
        return this.extractFromContentBlocks(content);
      }
    }

    // Claude format: payload.content (string or array)
    if (payload.content) {
      if (typeof payload.content === 'string') {
        return payload.content;
      }
      if (Array.isArray(payload.content)) {
        return this.extractFromContentBlocks(payload.content);
      }
    }

    // Streaming delta format
    const delta = payload.delta as Record<string, unknown> | undefined;
    if (delta?.text && typeof delta.text === 'string') {
      return delta.text;
    }

    return null;
  }

  /**
   * Extract content from content blocks array.
   */
  private extractFromContentBlocks(blocks: unknown[]): string {
    return blocks
      .map((block) => {
        if (typeof block === 'object' && block !== null) {
          const b = block as Record<string, unknown>;
          if (b.type === 'text' && typeof b.text === 'string') {
            return b.text;
          }
        }
        return null;
      })
      .filter((text): text is string => text !== null)
      .join('\n');
  }

  /**
   * Extract tool invocation content.
   */
  private extractToolContent(payload: Record<string, unknown>): string {
    const toolName = this.getString(payload, 'tool_name')
      ?? this.getString(payload, 'name')
      ?? 'unknown';
    const toolInput = payload.input ?? payload.tool_input;
    const toolOutput = payload.output ?? payload.tool_output;

    let content = `Tool: ${toolName}`;
    if (toolInput !== undefined) {
      content += `\nInput: ${JSON.stringify(toolInput)}`;
    }
    if (toolOutput !== undefined) {
      content += `\nOutput: ${JSON.stringify(toolOutput)}`;
    }
    return content;
  }

  /**
   * Extract system message content.
   */
  private extractSystemContent(payload: Record<string, unknown>): string {
    return (
      this.getString(payload, 'message') ??
      this.getString(payload, 'content') ??
      this.getString(payload, 'text') ??
      'System message'
    );
  }

  /**
   * Extract error message content.
   */
  private extractErrorContent(payload: Record<string, unknown>): string {
    return (
      this.getString(payload, 'message') ??
      this.getString(payload, 'error') ??
      this.getString(payload, 'content') ??
      'Error occurred'
    );
  }

  /**
   * Extract metadata from payload based on message type.
   */
  private extractMetadata(
    payload: Record<string, unknown>,
    messageType: ChatMessageType
  ): Record<string, unknown> | undefined {
    switch (messageType) {
      case 'tool':
        return {
          toolName: this.getString(payload, 'tool_name') ?? this.getString(payload, 'name'),
          toolInput: payload.input ?? payload.tool_input,
          toolOutput: payload.output ?? payload.tool_output,
        };

      case 'assistant':
        if (payload.thinking) {
          return { thinking: payload.thinking };
        }
        break;

      case 'error':
        return {
          errorCode: this.getString(payload, 'error_code') ?? this.getString(payload, 'code'),
          stackTrace: this.getString(payload, 'stack_trace') ?? this.getString(payload, 'stackTrace'),
        };
    }

    return undefined;
  }

  /**
   * Safely get a string value from payload.
   */
  private getString(payload: Record<string, unknown>, key: string): string | undefined {
    const value = payload[key];
    return typeof value === 'string' ? value : undefined;
  }

  /**
   * Extract session_id from payload (supports various formats).
   */
  private extractSessionId(payload: Record<string, unknown>): string | null {
    const candidates = [
      payload.session_id,
      payload.sessionId,
      (payload.message as Record<string, unknown> | undefined)?.session_id,
      (payload.message as Record<string, unknown> | undefined)?.sessionId,
      (payload.result as Record<string, unknown> | undefined)?.session_id,
      (payload.result as Record<string, unknown> | undefined)?.sessionId,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }

    return null;
  }
}

