/**
 * @file llm-provider.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LLM provider abstraction for the Supervisor Agent.
 * Supports OpenAI-compatible APIs (OpenAI, Cerebras, etc.)
 */

import type { Logger } from 'pino';

/**
 * LLM provider types.
 */
export type LLMProviderType = 'openai' | 'cerebras' | 'anthropic';

/**
 * Configuration for LLM provider.
 */
export interface LLMConfig {
  provider: LLMProviderType;
  apiKey: string;
  model: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
}

/**
 * LLM provider interface.
 */
export interface LLMProvider {
  invoke(prompt: string): Promise<string>;
  getProviderInfo(): { provider: LLMProviderType; model: string };
}

/**
 * OpenAI-compatible LLM provider.
 * Works with OpenAI, Cerebras, and other OpenAI-compatible APIs.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  private readonly config: LLMConfig;
  private readonly logger: Logger;

  constructor(config: LLMConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'LLMProvider', provider: config.provider });
  }

  /**
   * Invoke the LLM with a prompt.
   */
  async invoke(prompt: string): Promise<string> {
    const baseUrl = this.config.baseUrl ?? this.getDefaultBaseUrl();
    const endpoint = `${baseUrl}/chat/completions`;

    this.logger.debug({ model: this.config.model, promptLength: prompt.length }, 'Invoking LLM');
    const startTime = Date.now();

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.config.model,
          messages: [{ role: 'user', content: prompt }],
          temperature: this.config.temperature ?? 0,
          max_tokens: this.config.maxTokens ?? 1024,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as {
        choices: { message: { content: string } }[];
      };

      const firstChoice = data.choices[0];
      const content = firstChoice?.message.content ?? '';
      const elapsed = Date.now() - startTime;

      this.logger.info(
        { model: this.config.model, responseLength: content.length, elapsedMs: elapsed },
        'LLM response received'
      );

      return content;
    } catch (error) {
      this.logger.error({ error, model: this.config.model }, 'LLM invocation failed');
      throw error;
    }
  }

  /**
   * Get default base URL for the provider.
   */
  private getDefaultBaseUrl(): string {
    switch (this.config.provider) {
      case 'openai':
        return 'https://api.openai.com/v1';
      case 'cerebras':
        return 'https://api.cerebras.ai/v1';
      case 'anthropic':
        return 'https://api.anthropic.com/v1';
      default:
        return 'https://api.openai.com/v1';
    }
  }

  /**
   * Get provider information.
   */
  getProviderInfo(): { provider: LLMProviderType; model: string } {
    return {
      provider: this.config.provider,
      model: this.config.model,
    };
  }
}

/**
 * Creates an LLM provider from environment configuration.
 */
export function createLLMProvider(
  env: {
    AGENT_PROVIDER?: string;
    AGENT_API_KEY?: string;
    AGENT_MODEL_NAME?: string;
    AGENT_BASE_URL?: string;
    AGENT_TEMPERATURE?: number;
  },
  logger: Logger
): LLMProvider | null {
  const provider = (env.AGENT_PROVIDER ?? 'openai').toLowerCase() as LLMProviderType;
  const apiKey = env.AGENT_API_KEY;

  if (!apiKey) {
    logger.warn('AGENT_API_KEY not configured, LLM provider disabled');
    return null;
  }

  // Default models per provider
  const defaults: Record<LLMProviderType, { model: string }> = {
    openai: { model: 'gpt-4o-mini' },
    cerebras: { model: 'llama3.1-70b' },
    anthropic: { model: 'claude-3-haiku-20240307' },
  };

  const config: LLMConfig = {
    provider,
    apiKey,
    model: env.AGENT_MODEL_NAME ?? defaults[provider].model,
    baseUrl: env.AGENT_BASE_URL,
    temperature: env.AGENT_TEMPERATURE ?? 0,
  };

  return new OpenAICompatibleProvider(config, logger);
}

