/**
 * @file agent-output-parser.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 *
 * Parses JSON stream output from headless CLI agents (cursor-agent, claude)
 * and converts to structured ContentBlock objects for rich UI rendering.
 */

import type { ContentBlock } from '../../domain/value-objects/content-block.js';
import {
  createTextBlock,
  createCodeBlock,
  createToolBlock,
  createThinkingBlock,
  createStatusBlock,
  createErrorBlock,
  type ToolStatus,
} from '../../domain/value-objects/content-block.js';
import { AGENT_EXECUTION_CONFIG } from '../../config/constants.js';

/**
 * Result of parsing a single JSON line.
 */
export interface ParseResult {
  /** Parsed content blocks (empty if not displayable) */
  blocks: ContentBlock[];
  /** Session ID extracted from the message */
  sessionId: string | null;
  /** True if this message indicates command completion */
  isComplete: boolean;
}

/**
 * Parses JSON stream output from headless terminals and converts to ContentBlock objects.
 *
 * Supports both cursor-agent and claude CLI output formats.
 */
export class AgentOutputParser {
  /**
   * Parse a single JSON line and convert to ContentBlocks.
   *
   * @param jsonLine - Single line of JSON output from agent CLI
   * @returns Parsed blocks, session ID, and completion status
   */
  parseLine(jsonLine: string): ParseResult {
    const trimmed = jsonLine.trim();

    if (!trimmed) {
      return { blocks: [], sessionId: null, isComplete: false };
    }

    try {
      const parsed: unknown = JSON.parse(trimmed);

      // Validate it's an object
      if (typeof parsed !== 'object' || parsed === null) {
        return { blocks: [], sessionId: null, isComplete: false };
      }

      const payload = parsed as Record<string, unknown>;

      // Extract session_id from various locations
      const sessionId = this.extractSessionId(payload);

      // Check if this is a completion message
      const messageType = payload.type as string | undefined;
      const completionTypes: readonly string[] = AGENT_EXECUTION_CONFIG.COMPLETION_TYPES;
      const isComplete = messageType !== undefined && completionTypes.includes(messageType);

      if (isComplete) {
        return { blocks: [], sessionId, isComplete: true };
      }

      // Map to ContentBlocks
      const blocks = this.mapToContentBlocks(payload);

      return { blocks, sessionId, isComplete: false };
    } catch {
      // Not valid JSON, skip gracefully
      // This can happen with partial lines or non-JSON output
      return { blocks: [], sessionId: null, isComplete: false };
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
      if (result.blocks.length > 0 || result.sessionId || result.isComplete) {
        results.push(result);
      }
    }

    return { results, remaining };
  }

  /**
   * Map JSON payload to ContentBlocks.
   */
  private mapToContentBlocks(payload: Record<string, unknown>): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    const type = payload.type as string | undefined;
    const role = payload.role as string | undefined;

    // Handle thinking content first (if present alongside other content)
    const thinking = this.extractThinking(payload);
    if (thinking) {
      blocks.push(createThinkingBlock(thinking));
    }

    // Determine message type and extract content
    if (type === 'tool' || type === 'tool_use' || type === 'tool_result' || payload.tool_name) {
      const toolBlock = this.parseToolCall(payload);
      if (toolBlock) {
        blocks.push(toolBlock);
      }
    } else if (type === 'error' || payload.error) {
      const errorContent = this.extractErrorContent(payload);
      if (errorContent) {
        blocks.push(createErrorBlock(errorContent, this.getString(payload, 'error_code')));
      }
    } else if (type?.startsWith('system/') || type === 'system') {
      const systemContent = this.extractSystemContent(payload);
      if (systemContent) {
        blocks.push(createStatusBlock(systemContent));
      }
    } else if (type === 'user' || role === 'user') {
      const textContent = this.extractTextContent(payload);
      if (textContent) {
        blocks.push(createTextBlock(textContent));
      }
    } else if (type === 'assistant' || role === 'assistant' || type === 'content_block_delta' || type === 'message') {
      const assistantBlocks = this.parseAssistantContent(payload);
      blocks.push(...assistantBlocks);
    }

    return blocks;
  }

  /**
   * Parse assistant message content into blocks.
   * Handles text, code blocks, and mixed content.
   */
  private parseAssistantContent(payload: Record<string, unknown>): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    // Cursor format: payload.message.content (array of blocks)
    const message = payload.message as Record<string, unknown> | undefined;
    if (message?.content && Array.isArray(message.content)) {
      return this.parseContentArray(message.content as unknown[]);
    }

    // Claude format: payload.content (string or array)
    if (payload.content) {
      if (typeof payload.content === 'string') {
        const parsed = this.parseTextWithCodeBlocks(payload.content);
        blocks.push(...parsed);
      } else if (Array.isArray(payload.content)) {
        return this.parseContentArray(payload.content as unknown[]);
      }
    }

    // Streaming delta format
    const delta = payload.delta as Record<string, unknown> | undefined;
    if (delta?.text && typeof delta.text === 'string') {
      blocks.push(createTextBlock(delta.text));
    }

    return blocks;
  }

  /**
   * Parse content array (Claude/Cursor format with typed blocks).
   */
  private parseContentArray(content: unknown[]): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    for (const item of content) {
      if (typeof item !== 'object' || item === null) continue;

      const block = item as Record<string, unknown>;
      const blockType = block.type as string | undefined;

      if (blockType === 'text' && typeof block.text === 'string') {
        // Parse text for embedded code blocks
        const parsed = this.parseTextWithCodeBlocks(block.text);
        blocks.push(...parsed);
      } else if (blockType === 'tool_use') {
        const toolBlock = this.parseToolCall(block);
        if (toolBlock) {
          blocks.push(toolBlock);
        }
      }
    }

    return blocks;
  }

  /**
   * Parse text content that may contain markdown code blocks.
   */
  private parseTextWithCodeBlocks(text: string): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    const codeBlockRegex = /```(\w*)?\n([\s\S]*?)```/g;

    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Text before code block
      if (match.index > lastIndex) {
        const textBefore = text.slice(lastIndex, match.index).trim();
        if (textBefore) {
          blocks.push(createTextBlock(textBefore));
        }
      }

      // Code block
      const language = match[1] ?? undefined;
      const code = match[2] ?? '';
      blocks.push(createCodeBlock(code, language));

      lastIndex = match.index + match[0].length;
    }

    // Text after last code block
    if (lastIndex < text.length) {
      const textAfter = text.slice(lastIndex).trim();
      if (textAfter) {
        blocks.push(createTextBlock(textAfter));
      }
    }

    // If no code blocks found, return text as single block
    if (blocks.length === 0 && text.trim()) {
      blocks.push(createTextBlock(text));
    }

    return blocks;
  }

  /**
   * Parse tool call from payload.
   */
  private parseToolCall(payload: Record<string, unknown>): ContentBlock | null {
    const toolName = this.getString(payload, 'tool_name')
      ?? this.getString(payload, 'name')
      ?? 'unknown';

    const input = payload.input ?? payload.tool_input;
    const output = payload.output ?? payload.tool_output;

    // Determine status
    let status: ToolStatus = 'running';
    if (output !== undefined) {
      const hasError = payload.error ?? payload.is_error;
      status = hasError ? 'failed' : 'completed';
    }

    return createToolBlock(toolName, status, input, output);
  }

  /**
   * Extract thinking content from payload.
   */
  private extractThinking(payload: Record<string, unknown>): string | null {
    const thinking = payload.thinking;
    if (typeof thinking === 'string') {
      return thinking;
    }

    // Check in message.thinking
    const message = payload.message as Record<string, unknown> | undefined;
    if (message?.thinking && typeof message.thinking === 'string') {
      return message.thinking;
    }

    return null;
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
      return this.extractTextFromContentBlocks(content);
    }

    return null;
  }

  /**
   * Extract text from content blocks array.
   */
  private extractTextFromContentBlocks(blocks: unknown[]): string {
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
