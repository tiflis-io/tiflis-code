/**
 * @file chat-history-service.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Service for persisting and retrieving chat history.
 */

import type { Logger } from "pino";
import {
  MessageRepository,
  type CreateMessageParams,
} from "../../infrastructure/persistence/repositories/message-repository.js";
import {
  SessionRepository,
  type CreateSessionParams,
} from "../../infrastructure/persistence/repositories/session-repository.js";
import { AudioStorage } from "../../infrastructure/persistence/storage/audio-storage.js";
import type { ChatMessage } from "../../domain/value-objects/chat-message.js";
import type { SessionType } from "../../domain/entities/session.js";
import { getAgentConfig } from "../../config/constants.js";

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
  role: "user" | "assistant" | "system";
  contentType: "text" | "audio" | "transcription";
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
    this.logger = config.logger.child({ component: "ChatHistoryService" });
  }

  /**
   * Records a session creation in the database.
   *
   * @param params.agentName - Optional agent name (alias like 'zai'). When provided, stored as type for agent sessions.
   */
  recordSessionCreated(params: {
    sessionId: string;
    sessionType: SessionType;
    agentName?: string;
    workspace?: string;
    project?: string;
    worktree?: string;
    workingDir: string;
  }): void {
    // Use agentName if provided (for aliases), otherwise use sessionType
    const typeToStore = params.agentName ?? params.sessionType;
    this.logger.info(
      {
        sessionId: params.sessionId,
        sessionType: params.sessionType,
        agentName: params.agentName,
        typeToStore,
      },
      "Recording session creation in database"
    );
    try {
      const createParams: CreateSessionParams = {
        id: params.sessionId,
        type: typeToStore,
        workspace: params.workspace,
        project: params.project,
        worktree: params.worktree,
        workingDir: params.workingDir,
      };
      this.sessionRepo.create(createParams);
      this.logger.info(
        { sessionId: params.sessionId },
        "Session recorded in database successfully"
      );
    } catch (error) {
      this.logger.error(
        { error, sessionId: params.sessionId },
        "Failed to record session"
      );
    }
  }

  /**
   * Records a session termination in the database.
   */
  recordSessionTerminated(sessionId: string): void {
    try {
      this.sessionRepo.terminate(sessionId);
      this.logger.debug({ sessionId }, "Session termination recorded");
    } catch (error) {
      this.logger.error(
        { error, sessionId },
        "Failed to record session termination"
      );
    }
  }

  /**
   * Saves a chat message to the database.
   */
  saveMessage(
    sessionId: string,
    message: ChatMessage,
    isComplete = false
  ): string {
    const role = this.mapMessageTypeToRole(message.type);
    const params: CreateMessageParams = {
      sessionId,
      role,
      contentType: "text",
      content: message.content,
      isComplete,
    };

    const saved = this.messageRepo.create(params);
    this.logger.debug(
      { sessionId, messageId: saved.id, role },
      "Message saved"
    );
    return saved.id;
  }

  /**
   * Saves a voice message with audio input.
   * @param sessionId - Session ID (or 'supervisor' for global supervisor)
   * @param audioBuffer - Raw audio data
   * @param transcription - Transcribed text
   * @param contentBlocks - Optional content blocks (voice_input block)
   * @param format - Audio format (default: 'm4a')
   * @returns Message ID
   */
  async saveVoiceInput(
    sessionId: string,
    audioBuffer: Buffer,
    transcription: string,
    contentBlocks?: unknown[],
    format = "m4a"
  ): Promise<string> {
    // Ensure supervisor session exists if saving to supervisor
    if (sessionId === ChatHistoryService.SUPERVISOR_SESSION_ID) {
      this.ensureSupervisorSession();
    }

    // Generate message ID first so we can use it for audio file naming
    const { nanoid } = await import("nanoid");
    const messageId = nanoid(16);

    // Save audio file
    const audioPath = await this.audioStorage.saveInputAudio(
      sessionId,
      messageId,
      audioBuffer,
      format
    );

    // Create message record
    const params: CreateMessageParams = {
      sessionId,
      role: "user",
      contentType: "transcription",
      content: transcription,
      contentBlocks: contentBlocks ? JSON.stringify(contentBlocks) : undefined,
      audioInputPath: audioPath,
      isComplete: true,
    };

    const saved = this.messageRepo.create(params);
    this.logger.debug(
      { sessionId, messageId: saved.id, audioPath },
      "Voice input saved"
    );
    return saved.id;
  }

  /**
   * Saves TTS audio output for a message.
   */
  async saveTTSOutput(
    sessionId: string,
    messageId: string,
    audioBuffer: Buffer,
    format = "mp3"
  ): Promise<string> {
    // Save audio file
    const audioPath = await this.audioStorage.saveOutputAudio(
      sessionId,
      messageId,
      audioBuffer,
      format
    );

    // Update message record
    this.messageRepo.setAudioOutput(messageId, audioPath);
    this.logger.debug({ sessionId, messageId, audioPath }, "TTS output saved");
    return audioPath;
  }

  /**
   * Saves TTS audio and appends a voice_output block to the last assistant message.
   * Returns the message ID of the updated message.
   */
  async saveTTSWithVoiceBlock(
    sessionId: string,
    audioBuffer: Buffer,
    voiceBlock: unknown,
    format = "mp3"
  ): Promise<string | null> {
    // Get the last message for this session
    const lastMessage = this.messageRepo.getLastBySession(sessionId);
    if (lastMessage?.role !== "assistant") {
      this.logger.warn(
        { sessionId },
        "No assistant message found to attach TTS audio"
      );
      return null;
    }

    // Extract tracking message_id from voiceBlock for audio filename
    // This allows clients to request audio by the tracking ID
    let trackingMessageId = lastMessage.id;
    if (typeof voiceBlock === "object" && voiceBlock !== null) {
      const block = voiceBlock as Record<string, unknown>;
      const metadata = block.metadata as Record<string, unknown> | undefined;
      if (metadata?.message_id && typeof metadata.message_id === "string") {
        trackingMessageId = metadata.message_id;
      }
    }

    // Save audio file using the tracking message ID (so clients can request by this ID)
    const audioPath = await this.audioStorage.saveOutputAudio(
      sessionId,
      trackingMessageId,
      audioBuffer,
      format
    );

    // Parse existing content blocks
    let contentBlocks: unknown[] = [];
    if (lastMessage.contentBlocks) {
      try {
        contentBlocks = JSON.parse(lastMessage.contentBlocks) as unknown[];
      } catch {
        // Ignore parse errors
      }
    }

    // Append voice output block
    contentBlocks.push(voiceBlock);

    // Update message with audio path and new content blocks
    this.messageRepo.setAudioOutput(lastMessage.id, audioPath);
    this.messageRepo.updateContentBlocks(
      lastMessage.id,
      JSON.stringify(contentBlocks)
    );

    this.logger.debug(
      { sessionId, messageId: lastMessage.id, audioPath },
      "TTS output saved with voice block"
    );
    return lastMessage.id;
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
      role: row.role as "user" | "assistant" | "system",
      contentType: row.contentType as "text" | "audio" | "transcription",
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
  getMessagesSince(
    sessionId: string,
    since: Date,
    limit = 100
  ): StoredMessage[] {
    const rows = this.messageRepo.getAfterTimestamp(sessionId, since, limit);
    return rows.map((row) => ({
      id: row.id,
      sessionId: row.sessionId,
      sequence: row.sequence,
      role: row.role as "user" | "assistant" | "system",
      contentType: row.contentType as "text" | "audio" | "transcription",
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
   * Gets audio for a message by message ID.
   * Returns audio_base64 if available.
   *
   * First tries to find by database message ID, then falls back to
   * searching for audio files by tracking message ID (used in voice blocks).
   *
   * @param messageId - The message ID to get audio for (database ID or tracking ID)
   * @param type - 'input' for user voice, 'output' for TTS
   */
  async getAudioForMessage(
    messageId: string,
    type: "input" | "output" = "output"
  ): Promise<string | null> {
    // First, try to find by database message ID
    const message = this.messageRepo.getById(messageId);
    if (message) {
      const audioPath =
        type === "input" ? message.audioInputPath : message.audioOutputPath;
      if (audioPath) {
        return this.getAudioBase64(audioPath);
      }
    }

    // Fallback: search for audio file by tracking message ID
    // This handles the case where client sends tracking ID from voice_output block
    const audioPath = await this.audioStorage.findAudioByMessageId(
      messageId,
      type
    );
    if (audioPath) {
      this.logger.debug(
        { messageId, type, audioPath },
        "Found audio by tracking ID"
      );
      return this.getAudioBase64(audioPath);
    }

    this.logger.debug({ messageId, type }, "No audio found for message");
    return null;
  }

  /**
   * Enriches content blocks with audio data from disk.
   * For voice_input blocks, loads from audioInputPath.
   * For voice_output blocks, loads from audioOutputPath.
   *
   * @param contentBlocks - Content blocks to enrich
   * @param audioOutputPath - Path to output audio file (TTS)
   * @param audioInputPath - Path to input audio file (user voice)
   * @param includeAudio - Whether to actually load and include audio data (default: true)
   *                       Set to false for sync.state to avoid huge messages
   */
  async enrichBlocksWithAudio(
    contentBlocks: unknown[] | undefined,
    audioOutputPath: string | null | undefined,
    audioInputPath?: string | null,
    includeAudio = true
  ): Promise<unknown[] | undefined> {
    if (!contentBlocks) {
      return contentBlocks;
    }

    // If not including audio, just return blocks with has_audio flags
    if (!includeAudio) {
      return contentBlocks.map((block) => {
        if (typeof block === "object" && block !== null) {
          const typedBlock = block as Record<string, unknown>;
          const metadata = (typedBlock.metadata ?? {}) as Record<
            string,
            unknown
          >;

          // Mark voice blocks with has_audio flag (so client knows audio is available)
          if (typedBlock.block_type === "voice_input" && audioInputPath) {
            return {
              ...typedBlock,
              metadata: {
                ...metadata,
                has_audio: true,
              },
            };
          }
          if (typedBlock.block_type === "voice_output" && audioOutputPath) {
            return {
              ...typedBlock,
              metadata: {
                ...metadata,
                has_audio: true,
              },
            };
          }
        }
        return block;
      });
    }

    // Load input audio if available
    let inputAudioBase64: string | null = null;
    if (audioInputPath) {
      inputAudioBase64 = await this.getAudioBase64(audioInputPath);
    }

    // Load output audio if available
    let outputAudioBase64: string | null = null;
    if (audioOutputPath) {
      outputAudioBase64 = await this.getAudioBase64(audioOutputPath);
    }

    // If no audio available, return blocks as-is
    if (!inputAudioBase64 && !outputAudioBase64) {
      return contentBlocks;
    }

    // Find voice blocks and inject audio_base64
    return contentBlocks.map((block) => {
      if (typeof block === "object" && block !== null) {
        const typedBlock = block as Record<string, unknown>;
        const metadata = (typedBlock.metadata ?? {}) as Record<string, unknown>;

        // Enrich voice_input blocks
        if (typedBlock.block_type === "voice_input" && inputAudioBase64) {
          return {
            ...typedBlock,
            metadata: {
              ...metadata,
              audio_base64: inputAudioBase64,
            },
          };
        }

        // Enrich voice_output blocks
        if (typedBlock.block_type === "voice_output" && outputAudioBase64) {
          return {
            ...typedBlock,
            metadata: {
              ...metadata,
              audio_base64: outputAudioBase64,
            },
          };
        }
      }
      return block;
    });
  }

  /**
   * Clears chat history for a session.
   */
  async clearSessionHistory(sessionId: string): Promise<void> {
    // Delete messages
    this.messageRepo.deleteBySession(sessionId);

    // Delete audio files
    await this.audioStorage.deleteSessionAudio(sessionId);

    this.logger.info({ sessionId }, "Session history cleared");
  }

  /**
   * Terminates a session in the database.
   * Marks it as terminated so it won't appear in active sessions.
   * @returns true if session was found and terminated, false if not found
   */
  terminateSession(sessionId: string): boolean {
    const session = this.sessionRepo.getById(sessionId);
    this.logger.debug(
      {
        sessionId,
        sessionFound: !!session,
        sessionStatus: session?.status,
        sessionType: session?.type,
      },
      "Database session lookup for termination"
    );

    if (!session) {
      this.logger.warn(
        { sessionId },
        "Session not found in database for termination"
      );
      return false;
    }

    // Session might already be terminated
    if (session.status === "terminated") {
      this.logger.info({ sessionId }, "Session already terminated in database");
      return true; // Consider it a successful termination
    }

    this.sessionRepo.terminate(sessionId);
    this.logger.info({ sessionId }, "Session terminated in database");
    return true;
  }

  /**
   * Cleanup old terminated sessions.
   */
  cleanupOldSessions(olderThanDays = 30): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const deleted = this.sessionRepo.deleteOldTerminated(cutoffDate);
    this.logger.info({ deleted, olderThanDays }, "Cleaned up old sessions");
    return deleted;
  }

  /**
   * Maps ChatMessage type to database role.
   */
  private mapMessageTypeToRole(type: string): "user" | "assistant" | "system" {
    switch (type) {
      case "user":
        return "user";
      case "assistant":
      case "tool":
        return "assistant";
      case "system":
      case "error":
      default:
        return "system";
    }
  }

  // ============================================================================
  // Supervisor History Methods
  // ============================================================================

  /**
   * Global supervisor session ID (shared across all devices).
   */
  private static readonly SUPERVISOR_SESSION_ID = "supervisor";

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
          type: "supervisor",
          workingDir: "/",
        });
        this.logger.debug({ sessionId }, "Created global supervisor session");
      }
    } catch {
      // Session might already exist, ignore
    }
  }

  /**
   * Saves a supervisor message to the database.
   * Messages are shared across all devices connected to this workstation.
   * @param contentBlocks - Optional structured content blocks (for assistant messages)
   * @param messageId - Optional ID to use (e.g., streaming_message_id for deduplication)
   */
  saveSupervisorMessage(
    role: "user" | "assistant",
    content: string,
    contentBlocks?: unknown[],
    messageId?: string
  ): string {
    this.ensureSupervisorSession();
    const sessionId = ChatHistoryService.SUPERVISOR_SESSION_ID;

    const params: CreateMessageParams = {
      sessionId,
      role,
      contentType: "text",
      content,
      contentBlocks: contentBlocks ? JSON.stringify(contentBlocks) : undefined,
      isComplete: true,
      messageId, // Pass through to repository for consistent IDs
    };

    const saved = this.messageRepo.create(params);
    this.logger.debug(
      { messageId: saved.id, role, hasBlocks: !!contentBlocks },
      "Supervisor message saved"
    );
    return saved.id;
  }

  /**
   * Gets supervisor chat history (global, shared across all devices).
   * Returns messages sorted by sequence (oldest first) for chronological display.
   */
  getSupervisorHistory(limit = 20): StoredMessage[] {
    const sessionId = ChatHistoryService.SUPERVISOR_SESSION_ID;
    const rows = this.messageRepo.getBySession(sessionId, limit);
    // Reverse to get chronological order (oldest first, since getBySession returns newest first)
    return rows.reverse().map((row) => {
      // Parse contentBlocks from JSON if present
      let contentBlocks: unknown[] | undefined;
      if (row.contentBlocks) {
        try {
          contentBlocks = JSON.parse(row.contentBlocks) as unknown[];
        } catch {
          // Ignore parse errors
        }
      }

      return {
        id: row.id,
        sessionId: row.sessionId,
        sequence: row.sequence,
        role: row.role as "user" | "assistant" | "system",
        contentType: row.contentType as "text" | "audio" | "transcription",
        content: row.content,
        contentBlocks,
        audioInputPath: row.audioInputPath,
        audioOutputPath: row.audioOutputPath,
        isComplete: row.isComplete ?? false,
        createdAt: row.createdAt,
      };
    });
  }

  getSupervisorHistoryPaginated(options: {
    beforeSequence?: number;
    limit?: number;
  } = {}): {
    messages: StoredMessage[];
    hasMore: boolean;
    oldestSequence?: number;
    newestSequence?: number;
  } {
    const sessionId = ChatHistoryService.SUPERVISOR_SESSION_ID;
    const result = this.messageRepo.getBySessionPaginated(sessionId, options);

    const messages = result.messages.reverse().map((row) => {
      let contentBlocks: unknown[] | undefined;
      if (row.contentBlocks) {
        try {
          contentBlocks = JSON.parse(row.contentBlocks) as unknown[];
        } catch {
          // Ignore parse errors
        }
      }

      return {
        id: row.id,
        sessionId: row.sessionId,
        sequence: row.sequence,
        role: row.role as "user" | "assistant" | "system",
        contentType: row.contentType as "text" | "audio" | "transcription",
        content: row.content,
        contentBlocks,
        audioInputPath: row.audioInputPath,
        audioOutputPath: row.audioOutputPath,
        isComplete: row.isComplete ?? false,
        createdAt: row.createdAt,
      };
    });

    const firstMsg = messages[0];
    const lastMsg = messages[messages.length - 1];

    return {
      messages,
      hasMore: result.hasMore,
      oldestSequence: firstMsg?.sequence,
      newestSequence: lastMsg?.sequence,
    };
  }

  clearSupervisorHistory(): void {
    const sessionId = ChatHistoryService.SUPERVISOR_SESSION_ID;
    this.messageRepo.deleteBySession(sessionId);
    this.logger.info({ sessionId }, "Supervisor history cleared");
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
    role: "user" | "assistant" | "system",
    content: string,
    contentBlocks?: unknown[],
    messageId?: string // Optional: use streaming_message_id for deduplication across devices
  ): string {
    const params: CreateMessageParams = {
      sessionId,
      role,
      contentType: "text",
      content,
      contentBlocks: contentBlocks ? JSON.stringify(contentBlocks) : undefined,
      isComplete: true,
      messageId, // Pass through to repository
    };

    const saved = this.messageRepo.create(params);
    this.logger.debug(
      { sessionId, messageId: saved.id, role, hasBlocks: !!contentBlocks },
      "Agent message saved"
    );
    return saved.id;
  }

  /**
   * Gets agent session chat history.
   * Returns messages sorted chronologically (oldest first).
   */
  getAgentHistory(sessionId: string, limit = 20): StoredMessage[] {
    const rows = this.messageRepo.getBySession(sessionId, limit);
    // Reverse to get chronological order (oldest first)
    return rows.reverse().map((row) => {
      // Parse contentBlocks from JSON if present
      let contentBlocks: unknown[] | undefined;
      if (row.contentBlocks) {
        try {
          contentBlocks = JSON.parse(row.contentBlocks) as unknown[];
          // Log if we have many blocks (for debugging block loss issues)
          if (contentBlocks.length > 20) {
            this.logger.debug(
              {
                sessionId,
                messageId: row.id,
                blockCount: contentBlocks.length,
                jsonLength: row.contentBlocks.length,
              },
              "Large message loaded with many content blocks"
            );
          }
        } catch (error) {
          // Log parse errors instead of silently ignoring
          this.logger.error(
            {
              sessionId,
              messageId: row.id,
              error,
              jsonLength: row.contentBlocks.length,
              jsonPreview: row.contentBlocks.slice(0, 200),
            },
            "Failed to parse contentBlocks JSON"
          );
        }
      }

      return {
        id: row.id,
        sessionId: row.sessionId,
        sequence: row.sequence,
        role: row.role as "user" | "assistant" | "system",
        contentType: row.contentType as "text" | "audio" | "transcription",
        content: row.content,
        contentBlocks,
        audioInputPath: row.audioInputPath,
        audioOutputPath: row.audioOutputPath,
        isComplete: row.isComplete ?? false,
        createdAt: row.createdAt,
      };
    });
  }

  getAgentHistoryPaginated(
    sessionId: string,
    options: { beforeSequence?: number; limit?: number } = {}
  ): {
    messages: StoredMessage[];
    hasMore: boolean;
    oldestSequence?: number;
    newestSequence?: number;
  } {
    const result = this.messageRepo.getBySessionPaginated(sessionId, options);

    const storedMessages = result.messages.reverse().map((row) => {
      let contentBlocks: unknown[] | undefined;
      if (row.contentBlocks) {
        try {
          contentBlocks = JSON.parse(row.contentBlocks) as unknown[];
        } catch (error) {
          this.logger.error(
            { sessionId, messageId: row.id, error },
            "Failed to parse contentBlocks JSON"
          );
        }
      }

      return {
        id: row.id,
        sessionId: row.sessionId,
        sequence: row.sequence,
        role: row.role as "user" | "assistant" | "system",
        contentType: row.contentType as "text" | "audio" | "transcription",
        content: row.content,
        contentBlocks,
        audioInputPath: row.audioInputPath,
        audioOutputPath: row.audioOutputPath,
        isComplete: row.isComplete ?? false,
        createdAt: row.createdAt,
      };
    });

    const firstMsg = storedMessages[0];
    const lastMsg = storedMessages[storedMessages.length - 1];

    return {
      messages: storedMessages,
      hasMore: result.hasMore,
      oldestSequence: firstMsg?.sequence,
      newestSequence: lastMsg?.sequence,
    };
  }

  clearAgentHistory(sessionId: string): void {
    this.messageRepo.deleteBySession(sessionId);
    this.logger.info({ sessionId }, "Agent session history cleared");
  }

  /**
   * Gets history for all active agent sessions.
   * @param sessionIds - List of active agent session IDs
   * @param limit - Max messages per session
   */
  getAllAgentHistories(
    sessionIds: string[],
    limit = 20
  ): Map<string, StoredMessage[]> {
    const histories = new Map<string, StoredMessage[]>();
    for (const sessionId of sessionIds) {
      const history = this.getAgentHistory(sessionId, limit);
      if (history.length > 0) {
        histories.set(sessionId, history);
      }
    }
    return histories;
  }

  /**
   * Gets all active agent sessions from database.
   * Used to restore sessions after workstation restart.
   * Includes both base agent types (cursor, claude, opencode) and aliases (e.g., 'zai').
   */
  getActiveAgentSessions(): {
    sessionId: string;
    sessionType: string;
    workspace?: string;
    project?: string;
    worktree?: string;
    workingDir: string;
    createdAt: Date;
  }[] {
    const activeSessions = this.sessionRepo.getActive();
    this.logger.debug(
      {
        totalActive: activeSessions.length,
        sessions: activeSessions.map((s) => ({
          id: s.id,
          type: s.type,
          status: s.status,
        })),
      },
      "getActiveAgentSessions: all active sessions"
    );

    // Filter sessions that are valid agents (base types or aliases)
    // Use getAgentConfig to check if the type is a known agent
    const agentSessions = activeSessions
      .filter((s) => {
        // Check if it's a known agent (base type or alias)
        const config = getAgentConfig(s.type);
        return config !== null;
      })
      .map((s) => ({
        sessionId: s.id,
        sessionType: s.type,
        workspace: s.workspace ?? undefined,
        project: s.project ?? undefined,
        worktree: s.worktree ?? undefined,
        workingDir: s.workingDir,
        createdAt: s.createdAt,
      }));
    this.logger.debug(
      { agentCount: agentSessions.length },
      "getActiveAgentSessions: filtered agent sessions"
    );
    return agentSessions;
  }

  // ============================================================================
  // Mock Data Seeding (for Screenshot Automation)
  // ============================================================================

  /**
   * Seeds mock chat history for screenshot automation.
   * Creates realistic conversation history with voice messages, code blocks, etc.
   *
   * @param agentSessions - Object with agent session IDs and their working directories
   */
  seedMockData(agentSessions: {
    claude?: { id: string; workingDir: string };
    cursor?: { id: string; workingDir: string };
    opencode?: { id: string; workingDir: string };
  }): void {
    this.logger.info("Seeding mock chat history for screenshots...");

    // Seed Supervisor conversation with voice messages
    this.seedSupervisorHistory();

    // Seed Claude agent chat with code examples
    if (agentSessions.claude) {
      this.ensureAgentSession(agentSessions.claude.id, "claude", agentSessions.claude.workingDir);
      this.seedClaudeAgentHistory(agentSessions.claude.id);
    }

    // Seed Cursor agent chat
    if (agentSessions.cursor) {
      this.ensureAgentSession(agentSessions.cursor.id, "cursor", agentSessions.cursor.workingDir);
      this.seedCursorAgentHistory(agentSessions.cursor.id);
    }

    // Seed OpenCode agent chat
    if (agentSessions.opencode) {
      this.ensureAgentSession(agentSessions.opencode.id, "opencode", agentSessions.opencode.workingDir);
      this.seedOpenCodeAgentHistory(agentSessions.opencode.id);
    }

    this.logger.info("Mock chat history seeded successfully");
  }

  /**
   * Ensures an agent session exists in the database.
   * Creates it if it doesn't exist.
   */
  private ensureAgentSession(sessionId: string, sessionType: string, workingDir: string): void {
    try {
      const existing = this.sessionRepo.getById(sessionId);
      if (!existing) {
        this.sessionRepo.create({
          id: sessionId,
          type: sessionType,
          workingDir,
        });
        this.logger.debug({ sessionId, sessionType }, "Created agent session in database for seeding");
      }
    } catch {
      // Session might already exist, ignore
    }
  }

  /**
   * Seeds Supervisor chat with a realistic voice conversation.
   */
  private seedSupervisorHistory(): void {
    this.ensureSupervisorSession();
    const sessionId = ChatHistoryService.SUPERVISOR_SESSION_ID;

    // Clear existing history first
    this.messageRepo.deleteBySession(sessionId);

    // User voice message 1
    const voiceInput1 = {
      id: "vi-1",
      block_type: "voice_input",
      content: "Show me the available workspaces",
      metadata: { duration: 2.1, has_audio: true }
    };
    this.messageRepo.create({
      sessionId,
      role: "user",
      contentType: "transcription",
      content: "Show me the available workspaces",
      contentBlocks: JSON.stringify([voiceInput1]),
      isComplete: true,
    });

    // Assistant response with voice output
    const textBlock1 = {
      id: "tb-1",
      block_type: "text",
      content: "I found 2 workspaces with several projects. The **work** workspace contains my-app and api-service. The **personal** workspace has your blog project. Would you like to start an agent session in any of these?"
    };
    const voiceOutput1 = {
      id: "vo-1",
      block_type: "voice_output",
      content: "I found 2 workspaces with several projects.",
      metadata: { duration: 4.2, has_audio: true }
    };
    this.messageRepo.create({
      sessionId,
      role: "assistant",
      contentType: "text",
      content: "I found 2 workspaces with several projects. The work workspace contains my-app and api-service. The personal workspace has your blog project. Would you like to start an agent session in any of these?",
      contentBlocks: JSON.stringify([textBlock1, voiceOutput1]),
      isComplete: true,
    });

    // User voice message 2
    const voiceInput2 = {
      id: "vi-2",
      block_type: "voice_input",
      content: "Start Claude on my-app",
      metadata: { duration: 1.8, has_audio: true }
    };
    this.messageRepo.create({
      sessionId,
      role: "user",
      contentType: "transcription",
      content: "Start Claude on my-app",
      contentBlocks: JSON.stringify([voiceInput2]),
      isComplete: true,
    });

    // Assistant response confirming session creation
    const textBlock2 = {
      id: "tb-2",
      block_type: "text",
      content: "I've started a new Claude Code session in **work/my-app**. You can find it in the sidebar under Agent Sessions. The session is ready for your commands!"
    };
    const voiceOutput2 = {
      id: "vo-2",
      block_type: "voice_output",
      content: "I've started a new Claude Code session in work/my-app.",
      metadata: { duration: 3.5, has_audio: true }
    };
    this.messageRepo.create({
      sessionId,
      role: "assistant",
      contentType: "text",
      content: "I've started a new Claude Code session in work/my-app. You can find it in the sidebar under Agent Sessions. The session is ready for your commands!",
      contentBlocks: JSON.stringify([textBlock2, voiceOutput2]),
      isComplete: true,
    });

    this.logger.debug("Seeded Supervisor history with voice conversation");
  }

  /**
   * Seeds Claude agent chat with code examples and tool use.
   */
  private seedClaudeAgentHistory(sessionId: string): void {
    // Clear existing history
    this.messageRepo.deleteBySession(sessionId);

    // User message with voice input (like Supervisor chat)
    const userVoiceBlock = {
      id: "vi-claude-1",
      block_type: "voice_input",
      content: "Add a health check endpoint to the API",
      metadata: {
        duration: 2.3,
        has_audio: true,
      }
    };

    this.messageRepo.create({
      sessionId,
      role: "user",
      contentType: "audio",
      content: "Add a health check endpoint to the API",
      contentBlocks: JSON.stringify([userVoiceBlock]),
      isComplete: true,
    });

    // Assistant response with tool use and code
    const thinkingBlock = {
      id: "think-1",
      block_type: "thinking",
      content: "I'll add a simple health check endpoint that returns the server status and version information."
    };
    const toolBlock = {
      id: "tool-1",
      block_type: "tool",
      content: "Edit",
      metadata: {
        tool_name: "Edit",
        tool_status: "completed",
        tool_input: JSON.stringify({ file: "src/routes/health.ts" }),
      }
    };
    const codeBlock = {
      id: "code-1",
      block_type: "code",
      content: `import { Router } from 'express';

const router = Router();

router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    version: process.env.npm_package_version,
    uptime: process.uptime()
  });
});

export default router;`,
      metadata: { language: "typescript" }
    };
    const textBlock = {
      id: "text-1",
      block_type: "text",
      content: "I've added a health check endpoint at `/health` that returns the server status, version, and uptime. You can test it with `curl http://localhost:3000/health`."
    };

    this.messageRepo.create({
      sessionId,
      role: "assistant",
      contentType: "text",
      content: "I've added a health check endpoint at /health that returns the server status, version, and uptime.",
      contentBlocks: JSON.stringify([thinkingBlock, toolBlock, codeBlock, textBlock]),
      isComplete: true,
    });

    this.logger.debug({ sessionId }, "Seeded Claude agent history with code example");
  }

  /**
   * Seeds Cursor agent chat.
   */
  private seedCursorAgentHistory(sessionId: string): void {
    // Clear existing history
    this.messageRepo.deleteBySession(sessionId);

    // User message
    this.messageRepo.create({
      sessionId,
      role: "user",
      contentType: "text",
      content: "Explain the project structure",
      isComplete: true,
    });

    // Assistant response
    const textBlock = {
      id: "text-cursor-1",
      block_type: "text",
      content: `This is a **Next.js portfolio site** with the following structure:

- \`/app\` - App router pages and layouts
- \`/components\` - Reusable React components
- \`/lib\` - Utility functions and helpers
- \`/public\` - Static assets (images, fonts)
- \`/styles\` - Global CSS and Tailwind config

The site uses **Tailwind CSS** for styling and **Framer Motion** for animations. Would you like me to explain any specific part in more detail?`
    };

    this.messageRepo.create({
      sessionId,
      role: "assistant",
      contentType: "text",
      content: "This is a Next.js portfolio site with app router, components, lib, public, and styles directories.",
      contentBlocks: JSON.stringify([textBlock]),
      isComplete: true,
    });

    this.logger.debug({ sessionId }, "Seeded Cursor agent history");
  }

  /**
   * Seeds OpenCode agent chat.
   */
  private seedOpenCodeAgentHistory(sessionId: string): void {
    // Clear existing history
    this.messageRepo.deleteBySession(sessionId);

    // User message
    this.messageRepo.create({
      sessionId,
      role: "user",
      contentType: "text",
      content: "Run the tests",
      isComplete: true,
    });

    // Assistant response with status
    const statusBlock = {
      id: "status-1",
      block_type: "status",
      content: "Running tests..."
    };
    const codeBlock = {
      id: "code-oc-1",
      block_type: "code",
      content: `✓ auth.test.ts (3 tests) 120ms
✓ api.test.ts (8 tests) 340ms
✓ utils.test.ts (5 tests) 45ms

Test Files  3 passed (3)
     Tests  16 passed (16)
      Time  0.51s`,
      metadata: { language: "shell" }
    };
    const textBlock = {
      id: "text-oc-1",
      block_type: "text",
      content: "All 16 tests passed across 3 test files. The test suite completed in 0.51 seconds."
    };

    this.messageRepo.create({
      sessionId,
      role: "assistant",
      contentType: "text",
      content: "All 16 tests passed across 3 test files.",
      contentBlocks: JSON.stringify([statusBlock, codeBlock, textBlock]),
      isComplete: true,
    });

    this.logger.debug({ sessionId }, "Seeded OpenCode agent history");
  }
}
