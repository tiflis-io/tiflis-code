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

/**
 * Merges tool blocks with the same tool_use_id.
 * When a tool_use and tool_result arrive separately, they should be merged into one block.
 * The merged block preserves input from tool_use and adds output from tool_result.
 * Preserves the original order of all blocks.
 *
 * @param blocks - Array of content blocks to merge
 * @returns Array with tool blocks merged by tool_use_id, preserving order
 */
export function mergeToolBlocks(blocks: ContentBlock[]): ContentBlock[] {
  // First pass: collect and merge tool blocks by tool_use_id
  const toolBlocksByUseId = new Map<string, ToolBlock>();

  for (const block of blocks) {
    if (isToolBlock(block) && block.metadata.tool_use_id) {
      const toolUseId = block.metadata.tool_use_id;
      const existing = toolBlocksByUseId.get(toolUseId);

      if (existing) {
        // Merge: combine existing and new block
        const mergedStatus = getMergedToolStatus(
          existing.metadata.tool_status,
          block.metadata.tool_status
        );

        const mergedBlock: ToolBlock = {
          id: existing.id, // Keep original ID
          block_type: 'tool',
          content: block.metadata.tool_name || existing.content,
          metadata: {
            tool_name: block.metadata.tool_name || existing.metadata.tool_name,
            tool_use_id: toolUseId,
            tool_input: block.metadata.tool_input ?? existing.metadata.tool_input,
            tool_output: block.metadata.tool_output ?? existing.metadata.tool_output,
            tool_status: mergedStatus,
          },
        };

        toolBlocksByUseId.set(toolUseId, mergedBlock);
      } else {
        toolBlocksByUseId.set(toolUseId, block);
      }
    }
  }

  // Second pass: build result preserving original order
  const seenToolUseIds = new Set<string>();
  const result: ContentBlock[] = [];

  for (const block of blocks) {
    if (isToolBlock(block) && block.metadata.tool_use_id) {
      const toolUseId = block.metadata.tool_use_id;
      // Only add each tool once (at its first position)
      if (!seenToolUseIds.has(toolUseId)) {
        seenToolUseIds.add(toolUseId);
        const mergedBlock = toolBlocksByUseId.get(toolUseId);
        if (mergedBlock) {
          result.push(mergedBlock);
        }
      }
      // Skip subsequent occurrences of same tool_use_id
    } else {
      // Non-tool blocks: add as-is, preserving their position
      result.push(block);
    }
  }

  return result;
}

/**
 * Determines the merged tool status.
 * Priority: completed > failed > running
 */
function getMergedToolStatus(
  status1: ToolStatus,
  status2: ToolStatus
): ToolStatus {
  if (status1 === 'completed' || status2 === 'completed') {
    return 'completed';
  }
  if (status1 === 'failed' || status2 === 'failed') {
    return 'failed';
  }
  return 'running';
}

/**
 * Accumulates new blocks into existing blocks array, merging tool blocks in-place.
 * This preserves the original order of blocks while updating tool status/output.
 *
 * Text block handling:
 * - If the last block is a text block, update it (streaming text)
 * - If the last block is NOT a text block (e.g., tool call), add new text block
 * - This preserves: Tool1 -> Text1 -> Tool2 -> Text2 order
 *
 * @param existing - Existing accumulated blocks (modified in place)
 * @param newBlocks - New blocks to add/merge
 */
export function accumulateBlocks(
  existing: ContentBlock[],
  newBlocks: ContentBlock[]
): void {
  for (const block of newBlocks) {
    if (isToolBlock(block) && block.metadata.tool_use_id) {
      const toolUseId = block.metadata.tool_use_id;
      // Find existing tool block with same tool_use_id
      const existingIndex = existing.findIndex(
        (b) => isToolBlock(b) && b.metadata.tool_use_id === toolUseId
      );

      if (existingIndex >= 0) {
        // Merge in-place at original position
        const existingBlock = existing[existingIndex] as ToolBlock;
        const mergedStatus = getMergedToolStatus(
          existingBlock.metadata.tool_status,
          block.metadata.tool_status
        );

        existing[existingIndex] = {
          id: existingBlock.id,
          block_type: 'tool',
          content: block.metadata.tool_name || existingBlock.content,
          metadata: {
            tool_name: block.metadata.tool_name || existingBlock.metadata.tool_name,
            tool_use_id: toolUseId,
            tool_input: block.metadata.tool_input ?? existingBlock.metadata.tool_input,
            tool_output: block.metadata.tool_output ?? existingBlock.metadata.tool_output,
            tool_status: mergedStatus,
          },
        };
      } else {
        // New tool block - add to end
        existing.push(block);
      }
    } else if (isTextBlock(block)) {
      // Text blocks: only update the LAST block if it's also a text block
      // If the last block is a tool/other block, add new text block to preserve order
      const lastBlock = existing[existing.length - 1];
      if (lastBlock && isTextBlock(lastBlock)) {
        // Last block is text - update it (LangGraph sends full state)
        existing[existing.length - 1] = block;
      } else {
        // Last block is not text (or no blocks) - add new text block
        existing.push(block);
      }
    } else {
      // Other blocks: just append
      existing.push(block);
    }
  }
}
