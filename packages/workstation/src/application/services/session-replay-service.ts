/**
 * @file session-replay-service.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 *
 * Service for replaying session history to clients.
 */

import type { Logger } from 'pino';
import type { ChatHistoryService, StoredMessage } from './chat-history-service.js';
import type { MessageBroadcaster } from '../../domain/ports/message-broadcaster.js';

/**
 * Configuration for SessionReplayService.
 */
export interface SessionReplayServiceConfig {
  chatHistoryService: ChatHistoryService;
  messageBroadcaster: MessageBroadcaster;
  logger: Logger;
}

/**
 * Message format for session replay.
 */
export interface ReplayMessage {
  id: string;
  timestamp: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentType: 'text' | 'audio' | 'transcription';
  audioUrl?: string;
  isComplete: boolean;
}

/**
 * Session replay response.
 */
export interface SessionReplayResponse {
  session_id: string;
  messages: ReplayMessage[];
  has_more: boolean;
  oldest_timestamp?: number;
}

/**
 * Service for replaying session history to clients.
 * Used when clients reconnect or subscribe to existing sessions.
 */
export class SessionReplayService {
  private readonly chatHistoryService: ChatHistoryService;
  private readonly messageBroadcaster: MessageBroadcaster;
  private readonly logger: Logger;

  constructor(config: SessionReplayServiceConfig) {
    this.chatHistoryService = config.chatHistoryService;
    this.messageBroadcaster = config.messageBroadcaster;
    this.logger = config.logger.child({ component: 'SessionReplayService' });
  }

  /**
   * Replays session history to a client.
   */
  async replay(
    sessionId: string,
    options: {
      limit?: number;
      sinceTimestamp?: number;
      includeAudio?: boolean;
    } = {}
  ): Promise<SessionReplayResponse> {
    const { limit = 50, sinceTimestamp, includeAudio = false } = options;

    this.logger.debug({ sessionId, limit, sinceTimestamp, includeAudio }, 'Replaying session');

    let messages: StoredMessage[];

    if (sinceTimestamp) {
      messages = this.chatHistoryService.getMessagesSince(
        sessionId,
        new Date(sinceTimestamp),
        limit + 1 // Get one extra to check if there are more
      );
    } else {
      messages = this.chatHistoryService.getSessionHistory(sessionId, limit + 1);
    }

    const hasMore = messages.length > limit;
    if (hasMore) {
      messages = messages.slice(0, limit);
    }

    // Convert to replay messages
    const replayMessages = await Promise.all(
      messages.map(async (msg) => this.convertToReplayMessage(msg, includeAudio))
    );

    // Sort by timestamp ascending (oldest first for replay)
    replayMessages.sort((a, b) => a.timestamp - b.timestamp);

    const firstMessage = replayMessages[0];
    const oldestTimestamp = firstMessage?.timestamp;

    this.logger.info(
      { sessionId, messageCount: replayMessages.length, hasMore },
      'Session replay prepared'
    );

    return {
      session_id: sessionId,
      messages: replayMessages,
      has_more: hasMore,
      oldest_timestamp: oldestTimestamp,
    };
  }

  /**
   * Streams session history to a client via WebSocket.
   */
  async streamReplay(
    sessionId: string,
    deviceId: string,
    options: {
      limit?: number;
      sinceTimestamp?: number;
      includeAudio?: boolean;
      delayMs?: number;
    } = {}
  ): Promise<void> {
    const { delayMs = 0 } = options;
    const replay = await this.replay(sessionId, options);

    this.logger.debug({ sessionId, deviceId, messageCount: replay.messages.length }, 'Streaming replay');

    for (const message of replay.messages) {
      const event = {
        type: 'session.replay_message',
        session_id: sessionId,
        payload: message,
      };

      this.messageBroadcaster.broadcastToSubscribers(sessionId, JSON.stringify(event));

      if (delayMs > 0) {
        await this.delay(delayMs);
      }
    }

    // Send replay complete event
    const completeEvent = {
      type: 'session.replay_complete',
      session_id: sessionId,
      payload: {
        message_count: replay.messages.length,
        has_more: replay.has_more,
        oldest_timestamp: replay.oldest_timestamp,
      },
    };

    this.messageBroadcaster.broadcastToSubscribers(sessionId, JSON.stringify(completeEvent));
  }

  /**
   * Converts a stored message to replay format.
   */
  private async convertToReplayMessage(
    msg: StoredMessage,
    includeAudio: boolean
  ): Promise<ReplayMessage> {
    const replayMsg: ReplayMessage = {
      id: msg.id,
      timestamp: msg.createdAt.getTime(),
      role: msg.role,
      content: msg.content,
      contentType: msg.contentType,
      isComplete: msg.isComplete,
    };

    // Include audio URL if requested and available
    if (includeAudio) {
      const audioPath = msg.audioOutputPath ?? msg.audioInputPath;
      if (audioPath) {
        try {
          const audioBase64 = await this.chatHistoryService.getAudioBase64(audioPath);
          if (audioBase64) {
            // Return as data URL
            const mimeType = audioPath.endsWith('.mp3') ? 'audio/mpeg' : 'audio/mp4';
            replayMsg.audioUrl = `data:${mimeType};base64,${audioBase64}`;
          }
        } catch (error) {
          this.logger.warn({ error, audioPath }, 'Failed to load audio for replay');
        }
      }
    }

    return replayMsg;
  }

  /**
   * Helper to add delay between messages.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

