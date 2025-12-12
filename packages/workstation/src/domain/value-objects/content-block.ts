/**
 * @file content-block.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Defines structured content blocks for agent output.
 * These blocks are sent to mobile clients for rich UI rendering.
 */

import { randomUUID } from 'crypto';

/**
 * Status of a tool call execution.
 */
export type ToolStatus = 'running' | 'completed' | 'failed';

/**
 * Style for action buttons.
 */
export type ActionButtonStyle = 'primary' | 'secondary' | 'destructive';

/**
 * Action button definition.
 */
export interface ActionButton {
  id: string;
  title: string;
  icon?: string;
  style: ActionButtonStyle;
  /** Action format: "send:<message>", "url:<url>", "session:<type>", or custom string */
  action: string;
}

/**
 * Base interface for all content blocks.
 */
interface BaseContentBlock {
  id: string;
  block_type: string;
}

/**
 * Text content block.
 */
export interface TextBlock extends BaseContentBlock {
  block_type: 'text';
  content: string;
}

/**
 * Code content block with optional language.
 */
export interface CodeBlock extends BaseContentBlock {
  block_type: 'code';
  content: string;
  metadata: {
    language?: string;
  };
}

/**
 * Tool call block with input/output.
 */
export interface ToolBlock extends BaseContentBlock {
  block_type: 'tool';
  content: string;
  metadata: {
    tool_name: string;
    tool_use_id?: string;
    tool_input?: string;
    tool_output?: string;
    tool_status: ToolStatus;
  };
}

/**
 * Thinking/reasoning block.
 */
export interface ThinkingBlock extends BaseContentBlock {
  block_type: 'thinking';
  content: string;
}

/**
 * Status message block.
 */
export interface StatusBlock extends BaseContentBlock {
  block_type: 'status';
  content: string;
}

/**
 * Error message block.
 */
export interface ErrorBlock extends BaseContentBlock {
  block_type: 'error';
  content: string;
  metadata?: {
    error_code?: string;
  };
}

/**
 * Voice input block (STT result).
 */
export interface VoiceInputBlock extends BaseContentBlock {
  block_type: 'voice_input';
  content: string; // Transcription text
  metadata: {
    audio_url?: string;
    duration?: number;
  };
}

/**
 * Voice output block (TTS audio).
 */
export interface VoiceOutputBlock extends BaseContentBlock {
  block_type: 'voice_output';
  content: string; // Text that was spoken
  metadata: {
    message_id?: string; // Used by iOS to look up audio in cache
    audio_url?: string;
    audio_base64?: string;
    duration?: number;
  };
}

/**
 * Action buttons block.
 */
export interface ActionButtonsBlock extends BaseContentBlock {
  block_type: 'action_buttons';
  content: ''; // Empty, buttons are in metadata
  metadata: {
    buttons: ActionButton[];
  };
}

/**
 * Union type for all content blocks.
 */
export type ContentBlock =
  | TextBlock
  | CodeBlock
  | ToolBlock
  | ThinkingBlock
  | StatusBlock
  | ErrorBlock
  | VoiceInputBlock
  | VoiceOutputBlock
  | ActionButtonsBlock;

/**
 * Type guard for text blocks.
 */
export function isTextBlock(block: ContentBlock): block is TextBlock {
  return block.block_type === 'text';
}

/**
 * Type guard for code blocks.
 */
export function isCodeBlock(block: ContentBlock): block is CodeBlock {
  return block.block_type === 'code';
}

/**
 * Type guard for tool blocks.
 */
export function isToolBlock(block: ContentBlock): block is ToolBlock {
  return block.block_type === 'tool';
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Creates a text block.
 */
export function createTextBlock(content: string): TextBlock {
  return {
    id: randomUUID(),
    block_type: 'text',
    content,
  };
}

/**
 * Creates a code block.
 */
export function createCodeBlock(code: string, language?: string): CodeBlock {
  return {
    id: randomUUID(),
    block_type: 'code',
    content: code,
    metadata: {
      language,
    },
  };
}

/**
 * Creates a tool block.
 */
export function createToolBlock(
  toolName: string,
  status: ToolStatus,
  input?: unknown,
  output?: unknown,
  toolUseId?: string
): ToolBlock {
  const inputStr = input !== undefined ? JSON.stringify(input) : undefined;
  const outputStr = output !== undefined ? JSON.stringify(output) : undefined;

  return {
    id: randomUUID(),
    block_type: 'tool',
    content: toolName,
    metadata: {
      tool_name: toolName,
      tool_use_id: toolUseId,
      tool_input: inputStr,
      tool_output: outputStr,
      tool_status: status,
    },
  };
}

/**
 * Creates a thinking block.
 */
export function createThinkingBlock(content: string): ThinkingBlock {
  return {
    id: randomUUID(),
    block_type: 'thinking',
    content,
  };
}

/**
 * Creates a status block.
 */
export function createStatusBlock(content: string): StatusBlock {
  return {
    id: randomUUID(),
    block_type: 'status',
    content,
  };
}

/**
 * Creates an error block.
 */
export function createErrorBlock(content: string, errorCode?: string): ErrorBlock {
  return {
    id: randomUUID(),
    block_type: 'error',
    content,
    metadata: errorCode ? { error_code: errorCode } : undefined,
  };
}

/**
 * Creates a voice input block.
 */
export function createVoiceInputBlock(
  transcription: string,
  audioUrl?: string,
  duration?: number
): VoiceInputBlock {
  return {
    id: randomUUID(),
    block_type: 'voice_input',
    content: transcription,
    metadata: {
      audio_url: audioUrl,
      duration,
    },
  };
}

/**
 * Creates a voice output block.
 */
export function createVoiceOutputBlock(
  text: string,
  options?: {
    messageId?: string;
    audioBase64?: string;
    duration?: number;
  }
): VoiceOutputBlock {
  return {
    id: randomUUID(),
    block_type: 'voice_output',
    content: text,
    metadata: {
      message_id: options?.messageId,
      audio_base64: options?.audioBase64,
      duration: options?.duration,
    },
  };
}

/**
 * Creates an action buttons block.
 */
export function createActionButtonsBlock(buttons: ActionButton[]): ActionButtonsBlock {
  return {
    id: randomUUID(),
    block_type: 'action_buttons',
    content: '',
    metadata: {
      buttons,
    },
  };
}

/**
 * Creates an action button.
 */
export function createActionButton(
  title: string,
  action: string,
  style: ActionButtonStyle = 'secondary',
  icon?: string
): ActionButton {
  return {
    id: randomUUID(),
    title,
    icon,
    style,
    action,
  };
}
