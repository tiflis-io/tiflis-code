/**
 * @file audio-storage.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { mkdir, writeFile, readFile, unlink, rm } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';

/**
 * Service for storing and retrieving audio files.
 */
export class AudioStorage {
  private readonly baseDir: string;

  constructor(dataDir: string) {
    this.baseDir = join(dataDir, 'audio');
  }

  /**
   * Saves user voice input audio.
   */
  async saveInputAudio(
    sessionId: string,
    messageId: string,
    audio: Buffer,
    format = 'm4a'
  ): Promise<string> {
    const dir = join(this.baseDir, 'input', sessionId);
    await mkdir(dir, { recursive: true });

    const path = join(dir, `${messageId}.${format}`);
    await writeFile(path, audio);

    return path;
  }

  /**
   * Saves TTS synthesized audio.
   */
  async saveOutputAudio(
    sessionId: string,
    messageId: string,
    audio: Buffer,
    format = 'mp3'
  ): Promise<string> {
    const dir = join(this.baseDir, 'output', sessionId);
    await mkdir(dir, { recursive: true });

    const path = join(dir, `${messageId}.${format}`);
    await writeFile(path, audio);

    return path;
  }

  /**
   * Gets audio file content.
   */
  async getAudio(path: string): Promise<Buffer> {
    return readFile(path);
  }

  /**
   * Gets audio file as base64.
   */
  async getAudioBase64(path: string): Promise<string> {
    const buffer = await readFile(path);
    return buffer.toString('base64');
  }

  /**
   * Deletes a specific audio file.
   */
  async deleteAudio(path: string): Promise<void> {
    if (existsSync(path)) {
      await unlink(path);
    }
  }

  /**
   * Deletes all audio files for a session.
   */
  async deleteSessionAudio(sessionId: string): Promise<void> {
    const inputDir = join(this.baseDir, 'input', sessionId);
    const outputDir = join(this.baseDir, 'output', sessionId);

    if (existsSync(inputDir)) {
      await rm(inputDir, { recursive: true, force: true });
    }

    if (existsSync(outputDir)) {
      await rm(outputDir, { recursive: true, force: true });
    }
  }

  /**
   * Checks if an audio file exists.
   */
  exists(path: string): boolean {
    return existsSync(path);
  }
}

