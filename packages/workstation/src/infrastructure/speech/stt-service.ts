/**
 * @file stt-service.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Speech-to-Text service supporting OpenAI Whisper and ElevenLabs providers.
 */

import { writeFile, unlink } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import type { Logger } from 'pino';

/**
 * STT provider types.
 */
export type STTProvider = 'openai' | 'elevenlabs';

/**
 * Supported audio formats for transcription.
 */
export type AudioFormat = 'mp3' | 'mp4' | 'm4a' | 'wav' | 'webm' | 'ogg' | 'opus';

/**
 * Configuration for STT service.
 */
export interface STTConfig {
  provider: STTProvider;
  apiKey: string;
  model: string;
  language?: string;
  baseUrl?: string;
}

/**
 * Result of STT transcription.
 */
export interface TranscriptionResult {
  /** Transcribed text */
  text: string;
  /** Detected language (if available) */
  language?: string;
  /** Audio duration in seconds (if available) */
  duration?: number;
  /** Confidence score (if available) */
  confidence?: number;
}

/**
 * Speech-to-Text service.
 * Supports OpenAI Whisper and ElevenLabs providers.
 */
export class STTService {
  private readonly config: STTConfig;
  private readonly logger: Logger;

  constructor(config: STTConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'STTService', provider: config.provider });
  }

  /**
   * Transcribe audio buffer to text.
   * @param audioBuffer - Audio data to transcribe
   * @param format - Audio format (default: 'm4a')
   * @param signal - Optional AbortSignal for cancellation
   */
  async transcribe(
    audioBuffer: Buffer,
    format: AudioFormat = 'm4a',
    signal?: AbortSignal
  ): Promise<TranscriptionResult> {
    this.logger.debug({ audioSize: audioBuffer.length, format }, 'Transcribing audio');

    const startTime = Date.now();

    try {
      const result =
        this.config.provider === 'openai'
          ? await this.transcribeOpenAI(audioBuffer, format, signal)
          : await this.transcribeElevenLabs(audioBuffer, format, signal);

      const elapsed = Date.now() - startTime;
      this.logger.info(
        {
          audioSize: audioBuffer.length,
          textLength: result.text.length,
          elapsedMs: elapsed,
          language: result.language,
        },
        'Transcription completed'
      );

      return result;
    } catch (error) {
      this.logger.error({ error, audioSize: audioBuffer.length }, 'Transcription failed');
      throw error;
    }
  }

  /**
   * Transcribe using OpenAI Whisper API.
   */
  private async transcribeOpenAI(
    audioBuffer: Buffer,
    format: AudioFormat,
    signal?: AbortSignal
  ): Promise<TranscriptionResult> {
    const baseUrl = this.config.baseUrl ?? 'https://api.openai.com/v1';
    const endpoint = `${baseUrl}/audio/transcriptions`;

    // OpenAI Whisper API requires multipart/form-data with a file
    // We need to write to temp file first
    const tempPath = join(tmpdir(), `stt-${randomUUID()}.${format}`);

    try {
      // Check if already cancelled before starting
      if (signal?.aborted) {
        throw new Error('Transcription cancelled');
      }

      await writeFile(tempPath, audioBuffer);

      // Use Node.js native FormData (available in Node 18+)
      const { Blob } = await import('buffer');

      // Read file as buffer and create blob
      const { readFile } = await import('fs/promises');
      const fileBuffer = await readFile(tempPath);
      const blob = new Blob([fileBuffer], { type: `audio/${format}` });

      const form = new FormData();
      form.append('file', blob, `audio.${format}`);
      form.append('model', this.config.model);
      if (this.config.language) {
        form.append('language', this.config.language);
      }

      this.logger.debug({ model: this.config.model, endpoint }, 'Sending request to OpenAI Whisper API');

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: form,
        signal, // Pass AbortSignal to fetch
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Whisper API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as { text: string };
      return {
        text: data.text,
        language: this.config.language,
      };
    } finally {
      // Cleanup temp file
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Transcribe using ElevenLabs Speech-to-Text API.
   */
  private async transcribeElevenLabs(
    audioBuffer: Buffer,
    format: AudioFormat,
    signal?: AbortSignal
  ): Promise<TranscriptionResult> {
    const baseUrl = this.config.baseUrl ?? 'https://api.elevenlabs.io/v1';
    const endpoint = `${baseUrl}/speech-to-text`;

    // ElevenLabs also uses multipart/form-data
    const tempPath = join(tmpdir(), `stt-${randomUUID()}.${format}`);

    try {
      // Check if already cancelled before starting
      if (signal?.aborted) {
        throw new Error('Transcription cancelled');
      }

      await writeFile(tempPath, audioBuffer);

      const FormData = (await import('formdata-node')).FormData;
      const { fileFromPath } = await import('formdata-node/file-from-path');

      const form = new FormData();
      form.set('audio', await fileFromPath(tempPath));
      form.set('model_id', this.config.model);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'xi-api-key': this.config.apiKey,
        },
        // FormData from formdata-node works with Node.js fetch
        body: form as unknown as RequestInit['body'],
        signal, // Pass AbortSignal to fetch
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs STT API error (${response.status}): ${errorText}`);
      }

      const data = (await response.json()) as { text: string; language_code?: string };
      return {
        text: data.text,
        language: data.language_code,
      };
    } finally {
      // Cleanup temp file
      try {
        await unlink(tempPath);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Check if the service is configured and ready.
   */
  isConfigured(): boolean {
    return Boolean(this.config.apiKey && this.config.model);
  }

  /**
   * Get provider information.
   */
  getProviderInfo(): { provider: STTProvider; model: string; language?: string } {
    return {
      provider: this.config.provider,
      model: this.config.model,
      language: this.config.language,
    };
  }
}

/**
 * Creates an STT service from environment configuration.
 */
export function createSTTService(
  env: {
    STT_PROVIDER?: string;
    STT_API_KEY?: string;
    STT_MODEL?: string;
    STT_LANGUAGE?: string;
    STT_BASE_URL?: string;
  },
  logger: Logger
): STTService | null {
  const provider = (env.STT_PROVIDER ?? 'openai').toLowerCase() as STTProvider;
  const apiKey = env.STT_API_KEY;

  if (!apiKey) {
    logger.warn('STT_API_KEY not configured, STT service disabled');
    return null;
  }

  // Default models per provider
  const defaults: Record<STTProvider, { model: string }> = {
    openai: { model: 'whisper-1' },
    elevenlabs: { model: 'scribe_v1' },
  };

  const config: STTConfig = {
    provider,
    apiKey,
    model: env.STT_MODEL ?? defaults[provider].model,
    language: env.STT_LANGUAGE,
    baseUrl: env.STT_BASE_URL,
  };

  return new STTService(config, logger);
}

