/**
 * @file tts-service.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Text-to-Speech service supporting OpenAI and ElevenLabs providers.
 */

import type { Logger } from 'pino';

/**
 * TTS provider types.
 */
export type TTSProvider = 'openai' | 'elevenlabs';

/**
 * Configuration for TTS service.
 */
export interface TTSConfig {
  provider: TTSProvider;
  apiKey: string;
  model: string;
  voice: string;
  baseUrl?: string;
}

/**
 * Result of TTS synthesis.
 */
export interface TTSResult {
  /** Audio buffer (MP3 format) */
  audio: Buffer;
  /** Content type (e.g., 'audio/mpeg') */
  contentType: string;
  /** Duration in seconds (if available) */
  duration?: number;
}

/**
 * Text-to-Speech service.
 * Supports OpenAI (tts-1) and ElevenLabs providers.
 */
export class TTSService {
  private readonly config: TTSConfig;
  private readonly logger: Logger;

  constructor(config: TTSConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'TTSService', provider: config.provider });
  }

  /**
   * Synthesize speech from text.
   */
  async synthesize(text: string): Promise<TTSResult> {
    this.logger.debug({ textLength: text.length }, 'Synthesizing speech');

    const startTime = Date.now();

    try {
      const result =
        this.config.provider === 'openai'
          ? await this.synthesizeOpenAI(text)
          : await this.synthesizeElevenLabs(text);

      const elapsed = Date.now() - startTime;
      this.logger.info(
        { textLength: text.length, audioSize: result.audio.length, elapsedMs: elapsed },
        'TTS synthesis completed'
      );

      return result;
    } catch (error) {
      this.logger.error({ error, textLength: text.length }, 'TTS synthesis failed');
      throw error;
    }
  }

  /**
   * Synthesize using OpenAI TTS API.
   */
  private async synthesizeOpenAI(text: string): Promise<TTSResult> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
    const endpoint = `${baseUrl}/audio/speech`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.config.model,
        input: text,
        voice: this.config.voice,
        response_format: 'mp3',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI TTS API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuffer),
      contentType: 'audio/mpeg',
    };
  }

  /**
   * Synthesize using ElevenLabs TTS API.
   */
  private async synthesizeElevenLabs(text: string): Promise<TTSResult> {
    const baseUrl = this.config.baseUrl ?? 'https://api.elevenlabs.io/v1';
    const endpoint = `${baseUrl}/text-to-speech/${this.config.voice}`;

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'xi-api-key': this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: this.config.model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs TTS API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      audio: Buffer.from(arrayBuffer),
      contentType: 'audio/mpeg',
    };
  }

  /**
   * Check if the service is configured and ready.
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.model && this.config.voice);
  }

  /**
   * Get provider information.
   */
  getProviderInfo(): { provider: TTSProvider; model: string; voice: string } {
    return {
      provider: this.config.provider,
      model: this.config.model,
      voice: this.config.voice,
    };
  }
}

/**
 * Creates a TTS service from environment configuration.
 */
export function createTTSService(
  env: {
    TTS_PROVIDER?: string;
    TTS_API_KEY?: string;
    TTS_MODEL?: string;
    TTS_VOICE?: string;
    TTS_BASE_URL?: string;
  },
  logger: Logger
): TTSService | null {
  const provider = (env.TTS_PROVIDER ?? 'openai').toLowerCase() as TTSProvider;
  const apiKey = env.TTS_API_KEY;

  if (!apiKey) {
    logger.warn('TTS_API_KEY not configured, TTS service disabled');
    return null;
  }

  // Default models and voices per provider
  const defaults: Record<TTSProvider, { model: string; voice: string }> = {
    openai: { model: 'tts-1', voice: 'alloy' },
    elevenlabs: { model: 'eleven_flash_v2_5', voice: '21m00Tcm4TlvDq8ikWAM' },
  };

  const config: TTSConfig = {
    provider,
    apiKey,
    model: env.TTS_MODEL ?? defaults[provider].model,
    voice: env.TTS_VOICE ?? defaults[provider].voice,
    baseUrl: env.TTS_BASE_URL,
  };

  return new TTSService(config, logger);
}

