/**
 * @file chat-history-service.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 *
 * Service for persisting and retrieving chat history.
 */

import type { Logger } from 'pino';
import { MessageRepository, type CreateMessageParams } from '../../infrastructure/persistence/repositories/message-repository.js';
import { SessionRepository, type CreateSessionParams } from '../../infrastructure/persistence/repositories/session-repository.js';
import { AudioStorage } from '../../infrastructure/persistence/storage/audio-storage.js';
import type { ChatMessage } from '../../domain/value-objects/chat-message.js';
import type { SessionType } from '../../domain/entities/session.js';

/**
 * Configuration for ChatHistoryService.
 */
export interface ChatHistoryServiceConfig {
  dataDir: string;
  logger: Logger;
}

/**
 * Stored message format (from database).
 */
export interface StoredMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  contentType: 'text' | 'audio' | 'transcription';
  content: string;
  audioInputPath?: string | null;
  audioOutputPath?: string | null;
  isComplete: boolean;
  createdAt: Date;
}

/**
 * Service for managing chat history persistence.
 * Integrates with AgentSessionManager to store messages in SQLite.
 */
export class ChatHistoryService {
  private readonly messageRepo: MessageRepository;
  private readonly sessionRepo: SessionRepository;
  private readonly audioStorage: AudioStorage;
  private readonly logger: Logger;

  constructor(config: ChatHistoryServiceConfig) {
    this.messageRepo = new MessageRepository();
    this.sessionRepo = new SessionRepository();
    this.audioStorage = new AudioStorage(config.dataDir);
    this.logger = config.logger.child({ component: 'ChatHistoryService' });
  }

  /**
   * Records a session creation in the database.
   */
  recordSessionCreated(params: {
    sessionId: string;
    sessionType: SessionType;
    workspace?: string;
    project?: string;
    worktree?: string;
    workingDir: string;
  }): void {
    try {
      const createParams: CreateSessionParams = {
        id: params.sessionId,
        type: params.sessionType,
        workspace: params.workspace,
        project: params.project,
        worktree: params.worktree,
        workingDir: params.workingDir,
      };
      this.sessionRepo.create(createParams);
      this.logger.debug({ sessionId: params.sessionId }, 'Session recorded in database');
    } catch (error) {
      this.logger.error({ error, sessionId: params.sessionId }, 'Failed to record session');
    }
  }

  /**
   * Records a session termination in the database.
   */
  recordSessionTerminated(sessionId: string): void {
    try {
      this.sessionRepo.terminate(sessionId);
      this.logger.debug({ sessionId }, 'Session termination recorded');
    } catch (error) {
      this.logger.error({ error, sessionId }, 'Failed to record session termination');
    }
  }

  /**
   * Saves a chat message to the database.
   */
  saveMessage(sessionId: string, message: ChatMessage, isComplete = false): string {
    const role = this.mapMessageTypeToRole(message.type);
    const params: CreateMessageParams = {
      sessionId,
      role,
      contentType: 'text',
      content: message.content,
      isComplete,
    };

    const saved = this.messageRepo.create(params);
    this.logger.debug({ sessionId, messageId: saved.id, role }, 'Message saved');
    return saved.id;
  }

  /**
   * Saves a voice message with audio input.
   */
  async saveVoiceInput(
    sessionId: string,
    messageId: string,
    audioBuffer: Buffer,
    transcription: string,
    format = 'm4a'
  ): Promise<string> {
    // Save audio file
    const audioPath = await this.audioStorage.saveInputAudio(sessionId, messageId, audioBuffer, format);

    // Create message record
    const params: CreateMessageParams = {
      sessionId,
      role: 'user',
      contentType: 'transcription',
      content: transcription,
      audioInputPath: audioPath,
      isComplete: true,
    };

    const saved = this.messageRepo.create(params);
    this.logger.debug({ sessionId, messageId: saved.id, audioPath }, 'Voice input saved');
    return saved.id;
  }

  /**
   * Saves TTS audio output for a message.
   */
  async saveTTSOutput(
    sessionId: string,
    messageId: string,
    audioBuffer: Buffer,
    format = 'mp3'
  ): Promise<string> {
    // Save audio file
    const audioPath = await this.audioStorage.saveOutputAudio(sessionId, messageId, audioBuffer, format);

    // Update message record
    this.messageRepo.setAudioOutput(messageId, audioPath);
    this.logger.debug({ sessionId, messageId, audioPath }, 'TTS output saved');
    return audioPath;
  }

  /**
   * Gets chat history for a session.
   */
  getSessionHistory(sessionId: string, limit = 100): StoredMessage[] {
    const rows = this.messageRepo.getBySession(sessionId, limit);
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role as 'user' | 'assistant' | 'system',
      contentType: row.contentType as 'text' | 'audio' | 'transcription',
      content: row.content,
      audioInputPath: row.audioInputPath,
      audioOutputPath: row.audioOutputPath,
      isComplete: row.isComplete ?? false,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Gets messages since a specific timestamp (for replay/sync).
   */
  getMessagesSince(sessionId: string, since: Date, limit = 100): StoredMessage[] {
    const rows = this.messageRepo.getAfterTimestamp(sessionId, since, limit);
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      role: row.role as 'user' | 'assistant' | 'system',
      contentType: row.contentType as 'text' | 'audio' | 'transcription',
      content: row.content,
      audioInputPath: row.audioInputPath,
      audioOutputPath: row.audioOutputPath,
      isComplete: row.isComplete ?? false,
      createdAt: row.createdAt,
    }));
  }

  /**
   * Gets audio file as base64.
   */
  async getAudioBase64(path: string): Promise<string | null> {
    if (!this.audioStorage.exists(path)) {
      return null;
    }
    return this.audioStorage.getAudioBase64(path);
  }

  /**
   * Clears chat history for a session.
   */
  async clearSessionHistory(sessionId: string): Promise<void> {
    // Delete messages
    this.messageRepo.deleteBySession(sessionId);

    // Delete audio files
    await this.audioStorage.deleteSessionAudio(sessionId);

    this.logger.info({ sessionId }, 'Session history cleared');
  }

  /**
   * Cleanup old terminated sessions.
   */
  cleanupOldSessions(olderThanDays = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const deleted = this.sessionRepo.deleteOldTerminated(cutoffDate);
    this.logger.info({ deleted, olderThanDays }, 'Cleaned up old sessions');
    return deleted;
  }

  /**
   * Maps ChatMessage type to database role.
   */
  private mapMessageTypeToRole(type: string): 'user' | 'assistant' | 'system' {
    switch (type) {
      case 'user':
        return 'user';
      case 'assistant':
      case 'tool':
        return 'assistant';
      case 'system':
      case 'error':
      default:
        return 'system';
    }
  }
}

