/**
 * @file streaming-simulator.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Simulates realistic streaming output for mock responses.
 */

import type { ContentBlock } from "../../domain/value-objects/content-block.js";

/**
 * Default delay between tokens in milliseconds.
 */
const DEFAULT_TOKEN_DELAY_MS = 30;

/**
 * Simulates streaming text output by emitting content blocks progressively.
 *
 * @param text - The full text to stream
 * @param delayMs - Delay between tokens in milliseconds
 * @param onBlock - Callback for each content block update
 * @param onComplete - Callback when streaming is complete
 */
export async function simulateStreaming(
  text: string,
  delayMs: number = DEFAULT_TOKEN_DELAY_MS,
  onBlock: (blocks: ContentBlock[], isComplete: boolean) => void,
  onComplete: () => void
): Promise<void> {
  // Split text into tokens (words + punctuation)
  const tokens = tokenize(text);

  let accumulated = "";

  for (let i = 0; i < tokens.length; i++) {
    accumulated += tokens[i];

    // Create a text content block with accumulated content
    const block: ContentBlock = {
      type: "text",
      text: accumulated,
    };

    // Emit the block (not complete yet)
    onBlock([block], false);

    // Wait before next token
    if (i < tokens.length - 1) {
      await sleep(delayMs);
    }
  }

  // Final emission with complete flag
  const finalBlock: ContentBlock = {
    type: "text",
    text: accumulated,
  };
  onBlock([finalBlock], true);

  onComplete();
}

/**
 * Simulates streaming with multiple content block types.
 * Useful for agent responses that include code blocks, tool calls, etc.
 *
 * @param blocks - Array of content blocks to stream
 * @param delayMs - Delay between tokens
 * @param onBlock - Callback for each update
 * @param onComplete - Callback when complete
 */
export async function simulateBlockStreaming(
  blocks: ContentBlock[],
  delayMs: number = DEFAULT_TOKEN_DELAY_MS,
  onBlock: (blocks: ContentBlock[], isComplete: boolean) => void,
  onComplete: () => void
): Promise<void> {
  const result: ContentBlock[] = [];

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex]!;

    if (block.type === "text" && block.text) {
      // Stream text blocks token by token
      const tokens = tokenize(block.text);
      let accumulated = "";

      for (let i = 0; i < tokens.length; i++) {
        accumulated += tokens[i];

        // Update current block in result
        const currentBlock: ContentBlock = {
          type: "text",
          text: accumulated,
        };

        // Emit all completed blocks plus current streaming block
        onBlock([...result, currentBlock], false);

        if (i < tokens.length - 1) {
          await sleep(delayMs);
        }
      }

      // Add completed text block to result
      result.push({ type: "text", text: accumulated });
    } else {
      // Non-text blocks are emitted immediately
      result.push(block);
      onBlock([...result], false);
      await sleep(delayMs * 3); // Slightly longer pause for non-text blocks
    }
  }

  // Final emission
  onBlock(result, true);
  onComplete();
}

/**
 * Tokenizes text into words and punctuation for realistic streaming.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let current = "";

  for (const char of text) {
    if (char === " ") {
      if (current) {
        tokens.push(current);
        current = "";
      }
      tokens.push(" ");
    } else if (/[.,!?;:\n]/.test(char)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      tokens.push(char);
    } else {
      current += char;
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Sleep utility for async delays.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
