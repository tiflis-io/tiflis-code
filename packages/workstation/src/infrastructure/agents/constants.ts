/**
 * @file constants.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

/**
 * Time window (ms) to ignore cancel requests after execution starts.
 * Prevents race conditions from late-arriving cancel signals.
 */
export const CANCEL_RACE_CONDITION_PROTECTION_MS = 500;

/**
 * Maximum number of conversation messages to keep in memory.
 * Older messages are trimmed to prevent context overflow.
 */
export const MAX_CONVERSATION_HISTORY_LENGTH = 150;

/**
 * Minimum similarity score (0-1) for fuzzy agent name matching.
 * Lower values allow more lenient matching.
 */
export const AGENT_NAME_SIMILARITY_THRESHOLD = 0.6;
