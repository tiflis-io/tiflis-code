/**
 * @file agent-output-parser.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Parses JSON stream output from headless CLI agents (cursor-agent, claude)
 * and converts to structured ContentBlock objects for rich UI rendering.
 */

import type { ContentBlock } from "../../domain/value-objects/content-block.js";
import {
  createTextBlock,
  createCodeBlock,
  createToolBlock,
  createThinkingBlock,
  createStatusBlock,
  createErrorBlock,
  type ToolStatus,
} from "../../domain/value-objects/content-block.js";
import { AGENT_EXECUTION_CONFIG } from "../../config/constants.js";

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
   * Enable debug logging (set via DEBUG_OPENCODE environment variable).
   */
  private static DEBUG = process.env.DEBUG_OPENCODE === "true";

  /**
   * Debug logger - only outputs when DEBUG is enabled.
   */
  private static log(message: string): void {
    if (AgentOutputParser.DEBUG) {
      // eslint-disable-next-line no-console
      console.log(`[AgentOutputParser] ${message}`);
    }
  }

  /**
   * Maps tool_use_id to tool name for matching results with their calls.
   */
  private toolUseIdToName = new Map<string, string>();

  /**
   * Parse OpenCode text output.
   *
   * OpenCode format:
   * {"type":"text","timestamp":1234567890,"sessionID":"ses_abc123","part":{"text":"response"}}
   */
  private parseOpenCodeText(
    payload: Record<string, unknown>
  ): ContentBlock | null {
    const part = payload.part as Record<string, unknown> | undefined;
    const text = this.getString(part, "text");

    if (!text?.trim()) {
      AgentOutputParser.log("⚠️ OpenCode text missing or empty");
      return null;
    }

    AgentOutputParser.log(
      `✅ OpenCode text parsed: ${text.substring(0, 100)}...`
    );
    return createTextBlock(text);
  }

  /**
   * Parse OpenCode assistant message.
   *
   * OpenCode may use "session.assistant_message" for responses
   */
  private parseOpenCodeAssistantMessage(
    payload: Record<string, unknown>
  ): ContentBlock | null {
    AgentOutputParser.log("🔍 Parsing OpenCode assistant message");

    const message = payload.message as Record<string, unknown> | undefined;
    const content = message?.content as Record<string, unknown> | undefined;
    const text = this.getString(content, "text");

    if (!text?.trim()) {
      AgentOutputParser.log("⚠️ OpenCode assistant message missing or empty");
      return null;
    }

    AgentOutputParser.log(
      `✅ OpenCode assistant message parsed: ${text.substring(0, 100)}...`
    );
    return createTextBlock(text);
  }

  /**
   * Parse OpenCode response message.
   *
   * OpenCode may use "session.response" for responses
   */
  private parseOpenCodeResponse(
    payload: Record<string, unknown>
  ): ContentBlock | null {
    AgentOutputParser.log("🔍 Parsing OpenCode response");

    const response = payload.response as Record<string, unknown> | undefined;
    const text = this.getString(response, "text");

    if (!text?.trim()) {
      AgentOutputParser.log("⚠️ OpenCode response missing or empty");
      return null;
    }

    AgentOutputParser.log(
      `✅ OpenCode response parsed: ${text.substring(0, 100)}...`
    );
    return createTextBlock(text);
  }

  /**
   * Parse OpenCode tool_use format.
   *
   * OpenCode format:
   * {"type":"tool_use","part":{"type":"tool","tool":"list","callID":"xxx","state":{"status":"completed","input":{...},"output":"..."}}}
   */
  private parseOpenCodeToolUse(
    payload: Record<string, unknown>
  ): ContentBlock | null {
    const part = payload.part as Record<string, unknown> | undefined;
    if (!part) return null;

    const toolName = this.getString(part, "tool") ?? "unknown";
    const callID = this.getString(part, "callID");
    const state = part.state as Record<string, unknown> | undefined;

    if (!state) {
      // Tool just started, no state yet
      return createToolBlock(toolName, "running", undefined, undefined, callID);
    }

    const statusStr = this.getString(state, "status");
    let status: ToolStatus = "running";
    if (statusStr === "completed") {
      status = "completed";
    } else if (statusStr === "error" || statusStr === "failed") {
      status = "failed";
    }

    const input = state.input;
    const output = state.output;

    AgentOutputParser.log(
      `OpenCode tool_use: ${toolName} (${status}) callID=${callID}`
    );

    return createToolBlock(toolName, status, input, output, callID);
  }

  /**
   * Parse a single line of output.
   */
  private parseLine(line: string): ParseResult | null {
    try {
      const parsed: unknown = JSON.parse(line);

      // Validate it's an object
      if (typeof parsed !== "object" || parsed === null) {
        return { blocks: [], sessionId: null, isComplete: false };
      }

      const payload = parsed as Record<string, unknown>;

      // Extract session_id from various locations
      const sessionId = this.extractSessionId(payload);

      // Check if this is a completion message
      const messageType = payload.type as string | undefined;
      const completionTypes: readonly string[] =
        AGENT_EXECUTION_CONFIG.COMPLETION_TYPES;
      const isComplete =
        messageType !== undefined && completionTypes.includes(messageType);

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
    const lines = buffer.split("\n");
    const remaining = lines.pop() ?? ""; // Keep incomplete line
    const results: ParseResult[] = [];

    for (const line of lines) {
      const result = this.parseLine(line);
      if (result && (result.blocks.length > 0 || result.sessionId || result.isComplete)) {
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
    if (thinking?.trim()) {
      blocks.push(createThinkingBlock(thinking));
    }

    // Determine message type and extract content
    if (type === "tool_use" && payload.part) {
      // OpenCode tool_use format: {"type":"tool_use","part":{"type":"tool","tool":"list","state":{...}}}
      const toolBlock = this.parseOpenCodeToolUse(payload);
      if (toolBlock) {
        blocks.push(toolBlock);
      }
    } else if (
      type === "tool" ||
      type === "tool_result" ||
      payload.tool_name
    ) {
      const toolBlock = this.parseToolCall(payload);
      if (toolBlock) {
        blocks.push(toolBlock);
      }
    } else if (type === "tool_call") {
      // Cursor-style tool_call events with nested structure
      const toolBlock = this.parseCursorToolCall(payload);
      if (toolBlock) {
        blocks.push(toolBlock);
      }
    } else if (type === "error" || payload.error) {
      const errorContent = this.extractErrorContent(payload);
      if (errorContent) {
        blocks.push(
          createErrorBlock(errorContent, this.getString(payload, "error_code"))
        );
      }
    } else if (type?.startsWith("system/") || type === "system") {
      const systemContent = this.extractSystemContent(payload);
      if (systemContent) {
        blocks.push(createStatusBlock(systemContent));
      }
    } else if (type === "user" || role === "user") {
      // Check for tool_result in user messages (Claude CLI sends results this way)
      const toolResultBlocks = this.parseToolResults(payload);
      if (toolResultBlocks.length > 0) {
        blocks.push(...toolResultBlocks);
      }
      // Skip other user messages - they're echo of input
    } else if (type === "text") {
      // OpenCode format: {"type":"text","sessionID":"ses_...","part":{"text":"..."}}
      AgentOutputParser.log(
        `OpenCode: Detected type "text" event: ${JSON.stringify(payload).substring(0, 200)}`
      );
      const textBlock = this.parseOpenCodeText(payload);
      if (textBlock) {
        blocks.push(textBlock);
      }
    } else if (type === "session.assistant_message") {
      // OpenCode assistant message format
      AgentOutputParser.log(
        `OpenCode: Detected session.assistant_message event: ${JSON.stringify(payload).substring(0, 200)}`
      );
      const assistantBlock = this.parseOpenCodeAssistantMessage(payload);
      if (assistantBlock) {
        blocks.push(assistantBlock);
      }
    } else if (type === "session.response") {
      // OpenCode response format
      AgentOutputParser.log(
        `OpenCode: Detected session.response event: ${JSON.stringify(payload).substring(0, 200)}`
      );
      const responseBlock = this.parseOpenCodeResponse(payload);
      if (responseBlock) {
        blocks.push(responseBlock);
      }
    } else if (
      type === "assistant" ||
      role === "assistant" ||
      type === "content_block_delta" ||
      type === "message"
    ) {
      const assistantBlocks = this.parseAssistantContent(payload);
      blocks.push(...assistantBlocks);
    } else {
      // Log unknown event types for debugging - especially for OpenCode
      if (type?.startsWith("session.")) {
        AgentOutputParser.log(
          `OpenCode: Unhandled session event type "${type}": ${JSON.stringify(payload).substring(0, 200)}`
        );
      } else if (type) {
        AgentOutputParser.log(
          `Unknown event type "${type}": ${JSON.stringify(payload).substring(0, 200)}`
        );
      }
    }

    return blocks;
  }

  /**
   * Parse assistant message content into blocks.
   * Handles text, code blocks, and mixed content.
   */
  private parseAssistantContent(
    payload: Record<string, unknown>
  ): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    // Cursor format: payload.message.content (array of blocks)
    const message = payload.message as Record<string, unknown> | undefined;
    if (message?.content && Array.isArray(message.content)) {
      return this.parseContentArray(message.content as unknown[]);
    }

    // Claude format: payload.content (string or array)
    if (payload.content) {
      if (typeof payload.content === "string") {
        const parsed = this.parseTextWithCodeBlocks(payload.content);
        blocks.push(...parsed);
      } else if (Array.isArray(payload.content)) {
        return this.parseContentArray(payload.content as unknown[]);
      }
    }

    // Streaming delta format - only add if text is non-empty
    const delta = payload.delta as Record<string, unknown> | undefined;
    if (delta?.text && typeof delta.text === "string" && delta.text.trim()) {
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
      if (typeof item !== "object" || item === null) continue;

      const block = item as Record<string, unknown>;
      const blockType = block.type as string | undefined;

      if (blockType === "text" && typeof block.text === "string") {
        // Parse text for embedded code blocks
        const parsed = this.parseTextWithCodeBlocks(block.text);
        blocks.push(...parsed);
      } else if (blockType === "tool_use") {
        // Store tool_use_id -> name mapping for later tool_result matching
        const toolUseId = block.id as string | undefined;
        const toolName = block.name as string | undefined;
        if (toolUseId && toolName) {
          this.toolUseIdToName.set(toolUseId, toolName);
        }

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

      // Code block - only add if code is non-empty
      const language = match[1] ?? undefined;
      const code = (match[2] ?? "").trim();
      if (code) {
        blocks.push(createCodeBlock(code, language));
      }

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
   * Parse tool call (Claude format).
   */
  private parseToolCall(payload: Record<string, unknown>): ContentBlock | null {
    const toolName =
      this.getString(payload, "tool_name") ??
      this.getString(payload, "name") ??
      "unknown";

    const toolUseId = this.getString(payload, "id");
    const input = payload.input ?? payload.tool_input;
    const output = payload.output ?? payload.tool_output;

    // Determine status
    let status: ToolStatus = "running";
    if (output !== undefined) {
      const hasError = payload.error ?? payload.is_error;
      status = hasError ? "failed" : "completed";
    }

    return createToolBlock(toolName, status, input, output, toolUseId);
  }

  /**
   * Extract thinking content from payload.
   */
  private extractThinking(payload: Record<string, unknown>): string | null {
    const thinking = payload.thinking;
    if (typeof thinking === "string") {
      return thinking;
    }

    // Check in message.thinking
    const message = payload.message as Record<string, unknown> | undefined;
    if (message?.thinking && typeof message.thinking === "string") {
      return message.thinking;
    }

    return null;
  }

  /**
   * Maps Cursor tool key + args hash to generated tool_use_id for matching.
   */
  private cursorToolKeyToId = new Map<string, string>();

  /**
   * Counter for generating unique Cursor tool IDs.
   */
  private cursorToolIdCounter = 0;

  /**
   * Parse Cursor-style tool_call events.
   *
   * Cursor uses nested structure:
   * {"type":"tool_call","subtype":"started","tool_call":{"readToolCall":{"args":{...}}}}
   * {"type":"tool_call","subtype":"completed","tool_call":{"readToolCall":{"args":{},"result":{}}}}
   */
  private parseCursorToolCall(
    payload: Record<string, unknown>
  ): ContentBlock | null {
    const subtype = this.getString(payload, "subtype");
    const toolCallObj = payload.tool_call as
      | Record<string, unknown>
      | undefined;

    if (!toolCallObj) return null;

    // Find tool name from keys like 'readToolCall', 'writeToolCall', 'bashToolCall'
    const toolKey = Object.keys(toolCallObj).find((k) =>
      k.endsWith("ToolCall")
    );
    if (!toolKey) return null;

    const toolName = toolKey.replace("ToolCall", "");
    const toolData = toolCallObj[toolKey] as
      | Record<string, unknown>
      | undefined;
    const args = toolData?.args;
    const result = toolData?.result;

    // Generate a stable key for this tool call based on tool name and args
    // This allows us to match started/completed events
    const argsKey = args ? JSON.stringify(args) : "";
    const stableKey = `${toolKey}:${argsKey}`;

    let toolUseId: string;
    if (subtype === "started") {
      // Generate new ID for started event and store mapping
      toolUseId = `cursor_tool_${++this.cursorToolIdCounter}`;
      this.cursorToolKeyToId.set(stableKey, toolUseId);
    } else {
      // Look up ID for completed event
      toolUseId =
        this.cursorToolKeyToId.get(stableKey) ??
        `cursor_tool_${++this.cursorToolIdCounter}`;
      // Clean up mapping after completion
      this.cursorToolKeyToId.delete(stableKey);
    }

    // Determine status based on subtype and result presence
    let status: ToolStatus = "running";
    if (subtype === "completed") {
      status = result !== undefined ? "completed" : "failed";
    }

    return createToolBlock(toolName, status, args, result, toolUseId);
  }

  /**
   * Parse tool results from user messages.
   *
   * Claude CLI sends tool results as user messages with content array:
   * {"type":"user","message":{"content":[{"tool_use_id":"toolu_xxx","type":"tool_result","content":"..."}]}}
   */
  private parseToolResults(payload: Record<string, unknown>): ContentBlock[] {
    const blocks: ContentBlock[] = [];

    // Check message.content for tool_result items
    const message = payload.message as Record<string, unknown> | undefined;
    const content = message?.content;

    if (!Array.isArray(content)) {
      return blocks;
    }

    for (const item of content) {
      if (typeof item !== "object" || item === null) continue;

      const block = item as Record<string, unknown>;
      if (block.type !== "tool_result") continue;

      const toolUseId = block.tool_use_id as string | undefined;
      const resultContent = block.content;

      // Determine if this is an error result
      const isError = block.is_error === true;
      const status: ToolStatus = isError ? "failed" : "completed";

      // Look up the tool name from our mapping
      const toolName = toolUseId
        ? this.toolUseIdToName.get(toolUseId)
        : undefined;

      // Create a tool block with the result
      // Include tool_use_id so iOS can match it with the pending tool block
      blocks.push(
        createToolBlock(
          toolName ?? "tool",
          status,
          undefined, // input was already sent with tool_use
          resultContent,
          toolUseId
        )
      );
    }

    return blocks;
  }

  /**
   * Extract session ID from various payload locations.
   */
  private extractSessionId(payload: Record<string, unknown>): string | null {
    const candidates = [
      payload.session_id,
      payload.sessionId,
      payload.sessionID, // OpenCode uses camelCase
      (payload.message as Record<string, unknown> | undefined)?.session_id,
      (payload.message as Record<string, unknown> | undefined)?.sessionId,
      (payload.message as Record<string, unknown> | undefined)?.sessionID, // OpenCode
    ];

    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim().length > 0) {
        AgentOutputParser.log(`Session ID extracted: ${candidate.trim()}`);
        return candidate.trim();
      }
    }

    return null;
  }

  /**
   * Extract system message content.
   */
  private extractSystemContent(payload: Record<string, unknown>): string {
    return (
      this.getString(payload, "message") ??
      this.getString(payload, "content") ??
      this.getString(payload, "text") ??
      "System message"
    );
  }

  /**
   * Extract error message content.
   */
  private extractErrorContent(payload: Record<string, unknown>): string {
    return (
      this.getString(payload, "message") ??
      this.getString(payload, "error") ??
      this.getString(payload, "content") ??
      "Error occurred"
    );
  }

  /**
   * Safely get a string value from payload.
   * Returns undefined if payload is null/undefined or if key doesn't exist.
   */
  private getString(
    payload: Record<string, unknown> | undefined | null,
    key: string
  ): string | undefined {
    if (!payload) return undefined;
    const value = payload[key];
    return typeof value === "string" ? value : undefined;
  }
}
