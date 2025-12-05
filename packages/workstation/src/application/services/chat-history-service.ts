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
  sequence: number;
  role: 'user' | 'assistant' | 'system';
  contentType: 'text' | 'audio' | 'transcription';
  content: string;
  contentBlocks?: unknown[]; // Structured content blocks (parsed from JSON)
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
      sequence: row.sequence,
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
      sequence: row.sequence,
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

  // ============================================================================
  // Supervisor History Methods
  // ============================================================================

  /**
   * Global supervisor session ID (shared across all devices).
   */
  private static readonly SUPERVISOR_SESSION_ID = 'supervisor';

  /**
   * Ensures the global supervisor session exists.
   */
  ensureSupervisorSession(): void {
    const sessionId = ChatHistoryService.SUPERVISOR_SESSION_ID;
    try {
      const existing = this.sessionRepo.getById(sessionId);
      if (!existing) {
        this.sessionRepo.create({
          id: sessionId,
          type: 'supervisor',
          workingDir: '/',
        });
        this.logger.debug({ sessionId }, 'Created global supervisor session');
      }
    } catch {
      // Session might already exist, ignore
    }
  }

  /**
   * Saves a supervisor message to the database.
   * Messages are shared across all devices connected to this workstation.
   * @param contentBlocks - Optional structured content blocks (for assistant messages)
   */
  saveSupervisorMessage(
    role: 'user' | 'assistant',
    content: string,
    contentBlocks?: unknown[]
  ): string {
    this.ensureSupervisorSession();
    const sessionId = ChatHistoryService.SUPERVISOR_SESSION_ID;

    const params: CreateMessageParams = {
      sessionId,
      role,
      contentType: 'text',
      content,
      contentBlocks: contentBlocks ? JSON.stringify(contentBlocks) : undefined,
      isComplete: true,
    };

    const saved = this.messageRepo.create(params);
    this.logger.debug({ messageId: saved.id, role, hasBlocks: !!contentBlocks }, 'Supervisor message saved');
    return saved.id;
  }

  /**
   * Gets supervisor chat history (global, shared across all devices).
   * Returns messages sorted by sequence (oldest first) for chronological display.
   */
  getSupervisorHistory(limit = 50): StoredMessage[] {
    const sessionId = ChatHistoryService.SUPERVISOR_SESSION_ID;
    const rows = this.messageRepo.getBySession(sessionId, limit);
    // Reverse to get chronological order (oldest first, since getBySession returns newest first)
    return rows.reverse().map((row) => {
      // Parse contentBlocks from JSON if present
      let contentBlocks: unknown[] | undefined;
      if (row.contentBlocks) {
        try {
          contentBlocks = JSON.parse(row.contentBlocks);
        } catch {
          // Ignore parse errors
        }
      }

      return {
        id: row.id,
        sessionId: row.sessionId,
        sequence: row.sequence,
        role: row.role as 'user' | 'assistant' | 'system',
        contentType: row.contentType as 'text' | 'audio' | 'transcription',
        content: row.content,
        contentBlocks,
        audioInputPath: row.audioInputPath,
        audioOutputPath: row.audioOutputPath,
        isComplete: row.isComplete ?? false,
        createdAt: row.createdAt,
      };
    });
  }

  /**
   * Clears supervisor chat history (global).
   */
  clearSupervisorHistory(): void {
    const sessionId = ChatHistoryService.SUPERVISOR_SESSION_ID;
    this.messageRepo.deleteBySession(sessionId);
    this.logger.info({ sessionId }, 'Supervisor history cleared');
  }

  // ============================================================================
  // Agent Session History Methods
  // ============================================================================

  /**
   * Saves an agent session message to the database.
   * Each agent session has its own isolated history.
   * @param sessionId - The agent session ID
   * @param role - Message role (user, assistant, system)
   * @param content - Text content (summary for assistant messages)
   * @param contentBlocks - Structured content blocks for rich UI
   */
  saveAgentMessage(
    sessionId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    contentBlocks?: unknown[]
  ): string {
    const params: CreateMessageParams = {
      sessionId,
      role,
      contentType: 'text',
      content,
      contentBlocks: contentBlocks ? JSON.stringify(contentBlocks) : undefined,
      isComplete: true,
    };

    const saved = this.messageRepo.create(params);
    this.logger.debug({ sessionId, messageId: saved.id, role, hasBlocks: !!contentBlocks }, 'Agent message saved');
    return saved.id;
  }

  /**
   * Gets agent session chat history.
   * Returns messages sorted chronologically (oldest first).
   */
  getAgentHistory(sessionId: string, limit = 100): StoredMessage[] {
    const rows = this.messageRepo.getBySession(sessionId, limit);
    // Reverse to get chronological order (oldest first)
    return rows.reverse().map((row) => {
      // Parse contentBlocks from JSON if present
      let contentBlocks: unknown[] | undefined;
      if (row.contentBlocks) {
        try {
          contentBlocks = JSON.parse(row.contentBlocks);
        } catch {
          // Ignore parse errors
        }
      }

      return {
        id: row.id,
        sessionId: row.sessionId,
        sequence: row.sequence,
        role: row.role as 'user' | 'assistant' | 'system',
        contentType: row.contentType as 'text' | 'audio' | 'transcription',
        content: row.content,
        contentBlocks,
        audioInputPath: row.audioInputPath,
        audioOutputPath: row.audioOutputPath,
        isComplete: row.isComplete ?? false,
        createdAt: row.createdAt,
      };
    });
  }

  /**
   * Clears agent session chat history.
   */
  clearAgentHistory(sessionId: string): void {
    this.messageRepo.deleteBySession(sessionId);
    this.logger.info({ sessionId }, 'Agent session history cleared');
  }

  /**
   * Gets history for all active agent sessions.
   * @param sessionIds - List of active agent session IDs
   * @param limit - Max messages per session
   */
  getAllAgentHistories(sessionIds: string[], limit = 50): Map<string, StoredMessage[]> {
    const histories = new Map<string, StoredMessage[]>();
    for (const sessionId of sessionIds) {
      const history = this.getAgentHistory(sessionId, limit);
      if (history.length > 0) {
        histories.set(sessionId, history);
      }
    }
    return histories;
  }
}

