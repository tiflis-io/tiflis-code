/**
 * @file summarization-service.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Service for summarizing long responses before TTS synthesis.
 * Uses the same LLM provider as the supervisor agent.
 */

import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import type { Logger } from 'pino';

/**
 * Configuration for summarization service.
 */
export interface SummarizationConfig {
  apiKey: string;
  modelName: string;
  baseUrl?: string;
  maxSentences?: number;
}

/**
 * Context for summarization (optional chat history).
 */
export interface SummarizationContext {
  /** Recent messages for context (user/assistant pairs) */
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** The original user command that triggered this response */
  userCommand?: string;
}

/**
 * Service for summarizing long responses into concise TTS-friendly text.
 */
export class SummarizationService {
  private readonly llm: ChatOpenAI;
  private readonly logger: Logger;
  private readonly maxSentences: number;

  constructor(config: SummarizationConfig, logger: Logger) {
    this.logger = logger.child({ component: 'SummarizationService' });
    this.maxSentences = config.maxSentences ?? 3;

    this.llm = new ChatOpenAI({
      openAIApiKey: config.apiKey,
      modelName: config.modelName,
      temperature: 0.3, // Lower temperature for more consistent summaries
      configuration: config.baseUrl
        ? { baseURL: config.baseUrl }
        : undefined,
    });

    this.logger.info({ model: config.modelName, maxSentences: this.maxSentences }, 'Summarization service initialized');
  }

  /**
   * Summarizes a long response into a concise TTS-friendly text.
   *
   * @param text - The full response text to summarize
   * @param context - Optional context (chat history, user command)
   * @returns Summarized text suitable for TTS
   */
  async summarize(text: string, context?: SummarizationContext): Promise<string> {
    const wordCount = text.split(/\s+/).length;
    this.logger.debug({ textLength: text.length, wordCount }, 'Summarizing response for TTS');

    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt();
      // Sanitize input text before sending to LLM
      const sanitizedText = this.sanitizeForTTS(text);
      const userPrompt = this.buildUserPrompt(sanitizedText, context);

      const response = await this.llm.invoke([
        new SystemMessage(systemPrompt),
        new HumanMessage(userPrompt),
      ]);

      const summary = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);

      const elapsed = Date.now() - startTime;
      this.logger.info(
        { originalLength: text.length, summaryLength: summary.length, elapsedMs: elapsed },
        'Summarization completed'
      );

      // Sanitize output as final safety net
      return this.sanitizeForTTS(summary.trim());
    } catch (error) {
      this.logger.error({ error, textLength: text.length }, 'Summarization failed, returning original text');
      // On error, return sanitized original text
      return this.sanitizeForTTS(text);
    }
  }

  /**
   * Removes session IDs, file paths, and other technical identifiers from text.
   * This ensures TTS output is clean and natural.
   */
  private sanitizeForTTS(text: string): string {
    let result = text;

    // Remove absolute file paths (Unix and Windows)
    // /Users/roman/work/project/file.ts -> "file.ts" or remove entirely
    result = result.replace(/(?:\/[\w.-]+){2,}\/?([\w.-]+\.\w+)?/g, (_match, filename: string | undefined) => {
      return filename ?? '';
    });
    // C:\Users\... paths
    result = result.replace(/[A-Z]:\\[\w\\.-]+/gi, '');

    // Remove session IDs and alphanumeric identifiers
    // Patterns: session-abc123, id: 7f3a2b1c, UUID-like strings
    result = result.replace(/\b(?:session|id|uuid|token|key)[-_:]?\s*[a-f0-9-]{6,}/gi, '');
    // UUIDs: 550e8400-e29b-41d4-a716-446655440000
    result = result.replace(/\b[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\b/gi, '');
    // Generic alphanumeric IDs (6+ chars with mixed letters and numbers)
    result = result.replace(/\b(?=[a-z]*\d)(?=\d*[a-z])[a-z0-9]{6,}\b/gi, '');

    // Clean up resulting artifacts
    result = result.replace(/\s+/g, ' '); // Multiple spaces -> single
    result = result.replace(/\s+([.,!?])/g, '$1'); // Space before punctuation
    result = result.replace(/:\s*\./g, '.'); // ": ." -> "."
    result = result.replace(/\(\s*\)/g, ''); // Empty parentheses
    result = result.replace(/"\s*"/g, ''); // Empty quotes
    result = result.replace(/\bin\s+\./g, '.'); // "in ." -> "."
    result = result.replace(/\s{2,}/g, ' '); // Final cleanup of spaces

    return result.trim();
  }

  /**
   * Builds the system prompt for the summarization LLM.
   */
  private buildSystemPrompt(): string {
    return `You are a concise summarizer for voice output. Summarize AI assistant responses into 1-${this.maxSentences} SHORT sentences.

STRICT RULES:
- Maximum 20 words total (hard limit)
- Prefer 1 sentence when possible, 2 only if essential
- Extract ONLY the single most important result or action
- Natural spoken language only
- Never use markdown, bullets, or formatting
- Never start with "I" - use passive voice or action verbs

ABSOLUTELY FORBIDDEN (never include these in output):
- Session IDs or any alphanumeric identifiers (e.g., "session-abc123", "id: 7f3a2b", UUIDs)
- File paths starting with "/" or containing "/Users/", "/home/", "C:\\"
- Any string that looks like a technical identifier, hash, or token
- Code snippets, variable names, or technical jargon
- Long lists or enumerations

If the original text contains session IDs or paths, OMIT them entirely. Just describe what happened.

GOOD examples:
- "Created a new Claude session in the project."
- "Found 3 workspaces with main branch active."
- "Config updated, server restarted."
- "Fixed the authentication bug."

BAD examples (never do this):
- "Created session abc-123-def in /Users/roman/work/project" ❌
- "Session ID is 7f3a2b1c" ❌
- "Working in /home/user/documents/code" ❌`;
  }

  /**
   * Builds the user prompt with the text to summarize and optional context.
   */
  private buildUserPrompt(text: string, context?: SummarizationContext): string {
    let prompt = '';

    // Add user command context if available
    if (context?.userCommand) {
      prompt += `User asked: "${context.userCommand}"\n\n`;
    }

    prompt += `Summarize this response in ${this.maxSentences} sentences or less:\n\n${text}`;

    return prompt;
  }
}

/**
 * Creates a summarization service from environment configuration.
 * Uses the same AGENT_* variables as the supervisor agent.
 */
export function createSummarizationService(
  env: {
    AGENT_API_KEY?: string;
    AGENT_MODEL_NAME?: string;
    AGENT_BASE_URL?: string;
  },
  logger: Logger
): SummarizationService | null {
  const apiKey = env.AGENT_API_KEY;

  if (!apiKey) {
    logger.warn('AGENT_API_KEY not configured, summarization service disabled');
    return null;
  }

  const config: SummarizationConfig = {
    apiKey,
    modelName: env.AGENT_MODEL_NAME ?? 'gpt-4o-mini', // Use mini model for speed
    baseUrl: env.AGENT_BASE_URL,
    maxSentences: 2,
  };

  return new SummarizationService(config, logger);
}
