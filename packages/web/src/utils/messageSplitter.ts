// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import type { Message, ContentBlock } from '@/types';

/**
 * Configuration for message splitting
 */
interface MessageSplitterConfig {
  /** Maximum height units per segment (~1 screen worth) */
  maxHeightUnitsPerSegment: number;
  /** Minimum height units to consider splitting */
  minHeightUnitsToSplit: number;
}

const DEFAULT_CONFIG: MessageSplitterConfig = {
  maxHeightUnitsPerSegment: 14,
  minHeightUnitsToSplit: 17,
};

/**
 * Represents a segment of a split message for display
 */
export interface SplitMessageSegment {
  id: string;
  messageId: string;
  contentBlocks: ContentBlock[];
  segmentIndex: number;
  totalSegments: number;
  isFirstSegment: boolean;
  isLastSegment: boolean;
  isStreaming: boolean;
  showAvatar: boolean;
  createdAt: Date;
  role: Message['role'];
  sendStatus?: Message['sendStatus'];
  fromDeviceId?: string;
}

/** Approximate characters per line for height estimation */
const CHARS_PER_LINE = 45;

/**
 * Estimate the height of a content block in "line units"
 * 1 unit ≈ 1 line of text height
 */
function estimatedHeightUnits(block: ContentBlock): number {
  switch (block.blockType) {
    case 'text': {
      // Count actual newlines + estimate wrapped lines
      const newlines = block.content.split('\n').length;
      const estimatedWrappedLines = Math.max(1, Math.ceil(block.content.length / CHARS_PER_LINE));
      return Math.max(newlines, estimatedWrappedLines);
    }

    case 'code': {
      // Code blocks: actual line count + 2 for header/padding
      const lines = block.content.split('\n').length;
      return lines + 2;
    }

    case 'tool':
      // Collapsed tool call: icon + name + status ≈ 3 lines
      return 3;

    case 'thinking':
      // Collapsed by default: header only ≈ 2 lines
      return 2;

    case 'status':
      // Single line with spinner
      return 1;

    case 'error': {
      // Error box with icon + text
      const lines = Math.max(1, Math.ceil(block.content.length / CHARS_PER_LINE));
      return lines + 1;
    }

    case 'cancel':
      // Cancellation notice ≈ 2 lines
      return 2;

    case 'voice_input':
      // Waveform + transcription ≈ 3 lines
      return 3;

    case 'voice_output':
      // Play button + waveform ≈ 2 lines
      return 2;

    case 'action_buttons':
      // Each button row ≈ 2 lines
      return Math.max(1, block.metadata?.buttons?.length ?? 1) * 2;

    default:
      return 1;
  }
}

/**
 * Find the best split point in text (prefer paragraph/sentence/word boundaries)
 */
function findBestSplitPoint(text: string, targetLength: number): number {
  const searchWindow = text.slice(0, targetLength);
  const minSplit = Math.floor(targetLength / 2);

  // Try paragraph boundary first (\n\n)
  const paragraphIndex = searchWindow.lastIndexOf('\n\n');
  if (paragraphIndex > minSplit) {
    return paragraphIndex + 2;
  }

  // Try sentence boundaries
  const sentenceDelimiters = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];
  for (const delimiter of sentenceDelimiters) {
    const index = searchWindow.lastIndexOf(delimiter);
    if (index > minSplit) {
      return index + delimiter.length;
    }
  }

  // Try line boundary
  const newlineIndex = searchWindow.lastIndexOf('\n');
  if (newlineIndex > minSplit) {
    return newlineIndex + 1;
  }

  // Try word boundary (space)
  const wordMinSplit = Math.floor(targetLength / 3);
  const spaceIndex = searchWindow.lastIndexOf(' ');
  if (spaceIndex > wordMinSplit) {
    return spaceIndex + 1;
  }

  // Last resort: hard split at target length
  return targetLength;
}

/**
 * Split text at natural boundaries
 */
function splitText(text: string, maxLength: number): string[] {
  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    const splitPoint = findBestSplitPoint(remaining, maxLength);
    const part = remaining.slice(0, splitPoint).trim();
    if (part) {
      parts.push(part);
    }
    remaining = remaining.slice(splitPoint).trim();
  }

  if (remaining) {
    parts.push(remaining);
  }

  return parts.length === 0 ? [text] : parts;
}

/**
 * Create a single segment from a message (no splitting)
 */
function createSingleSegment(message: Message): SplitMessageSegment {
  return {
    id: `${message.id}-seg-0`,
    messageId: message.id,
    contentBlocks: message.contentBlocks,
    segmentIndex: 0,
    totalSegments: 1,
    isFirstSegment: true,
    isLastSegment: true,
    isStreaming: message.isStreaming,
    showAvatar: message.role === 'assistant',
    createdAt: message.createdAt,
    role: message.role,
    sendStatus: message.sendStatus,
    fromDeviceId: message.fromDeviceId,
  };
}

/**
 * Split a message into display segments based on estimated height
 */
export function splitMessage(
  message: Message,
  config: MessageSplitterConfig = DEFAULT_CONFIG
): SplitMessageSegment[] {
  // Don't split user messages
  if (message.role === 'user') {
    return [createSingleSegment(message)];
  }

  // Calculate total estimated height
  const totalHeight = message.contentBlocks.reduce(
    (sum, block) => sum + estimatedHeightUnits(block),
    0
  );

  // Don't split if under threshold
  if (totalHeight < config.minHeightUnitsToSplit) {
    return [createSingleSegment(message)];
  }

  // Split the message based on height units
  const segments: ContentBlock[][] = [];
  let currentBlocks: ContentBlock[] = [];
  let currentHeight = 0;

  for (const block of message.contentBlocks) {
    const blockHeight = estimatedHeightUnits(block);

    // Check if adding this block exceeds threshold
    if (currentHeight + blockHeight > config.maxHeightUnitsPerSegment && currentHeight > 0) {
      // For text blocks, try to split them if they're large
      if (block.blockType === 'text' && blockHeight > config.maxHeightUnitsPerSegment / 2) {
        // Flush current segment first
        if (currentBlocks.length > 0) {
          segments.push(currentBlocks);
          currentBlocks = [];
          currentHeight = 0;
        }

        // Split the large text block
        const maxCharsPerSegment = config.maxHeightUnitsPerSegment * CHARS_PER_LINE;
        const textParts = splitText(block.content, maxCharsPerSegment);

        for (let i = 0; i < textParts.length; i++) {
          const partContent = textParts[i];
          if (!partContent) continue;

          const partBlock: ContentBlock = {
            id: `${block.id}-part-${i}`,
            blockType: 'text',
            content: partContent,
            metadata: block.metadata,
          };

          if (i < textParts.length - 1) {
            segments.push([partBlock]);
          } else {
            currentBlocks.push(partBlock);
            currentHeight = estimatedHeightUnits(partBlock);
          }
        }
        continue;
      }

      // Flush current segment before adding this block
      if (currentBlocks.length > 0) {
        segments.push(currentBlocks);
        currentBlocks = [];
        currentHeight = 0;
      }
    }

    currentBlocks.push(block);
    currentHeight += blockHeight;
  }

  // Flush remaining blocks
  if (currentBlocks.length > 0) {
    segments.push(currentBlocks);
  }

  // Handle edge case: no segments created
  if (segments.length === 0) {
    return [createSingleSegment(message)];
  }

  // Convert to SplitMessageSegment objects
  const totalSegments = segments.length;
  return segments.map((blocks, index) => ({
    id: `${message.id}-seg-${index}`,
    messageId: message.id,
    contentBlocks: blocks,
    segmentIndex: index,
    totalSegments,
    isFirstSegment: index === 0,
    isLastSegment: index === totalSegments - 1,
    isStreaming: message.isStreaming && index === totalSegments - 1,
    showAvatar: index === 0,
    createdAt: message.createdAt,
    role: message.role,
    sendStatus: message.sendStatus,
    fromDeviceId: message.fromDeviceId,
  }));
}

/**
 * Split multiple messages into display segments
 */
export function splitMessages(messages: Message[]): SplitMessageSegment[] {
  return messages.flatMap((message) => splitMessage(message));
}
