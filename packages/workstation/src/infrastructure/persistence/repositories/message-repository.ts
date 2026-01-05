/**
 * @file message-repository.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { eq, desc, gt, lt, and, max, count } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '../database/client.js';
import { messages, type MessageRow, type NewMessageRow } from '../database/schema.js';

export interface CreateMessageParams {
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  contentType: 'text' | 'audio' | 'transcription';
  content: string;
  contentBlocks?: string; // JSON string of structured content blocks
  audioInputPath?: string;
  audioOutputPath?: string;
  isComplete?: boolean;
  messageId?: string; // Optional ID to use (e.g., streaming_message_id for deduplication)
}

/**
 * Repository for message persistence operations.
 */
export class MessageRepository {
  /**
   * Creates a new message with auto-incrementing sequence within session.
   */
  create(params: CreateMessageParams): MessageRow {
    const db = getDatabase();

    // Get next sequence number for this session
    const result = db
      .select({ maxSeq: max(messages.sequence) })
      .from(messages)
      .where(eq(messages.sessionId, params.sessionId))
      .get();
    const nextSequence = (result?.maxSeq ?? 0) + 1;

    const newMessage: NewMessageRow = {
      id: params.messageId ?? nanoid(16), // Use provided ID or generate new one
      sessionId: params.sessionId,
      sequence: nextSequence,
      role: params.role,
      contentType: params.contentType,
      content: params.content,
      contentBlocks: params.contentBlocks,
      audioInputPath: params.audioInputPath,
      audioOutputPath: params.audioOutputPath,
      isComplete: params.isComplete ?? false,
      createdAt: new Date(),
    };

    db.insert(messages).values(newMessage).run();
    return { ...newMessage, createdAt: newMessage.createdAt } as MessageRow;
  }

  getBySession(sessionId: string, limit = 100): MessageRow[] {
    const db = getDatabase();
    return db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.sequence))
      .limit(limit)
      .all();
  }

  getBySessionPaginated(
    sessionId: string,
    options: { beforeSequence?: number; limit?: number } = {}
  ): { messages: MessageRow[]; hasMore: boolean; totalCount: number } {
    const db = getDatabase();
    const limit = Math.min(options.limit ?? 20, 50);

    const totalResult = db
      .select({ count: count() })
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .get();
    const totalCount = totalResult?.count ?? 0;

    const whereClause = options.beforeSequence
      ? and(
          eq(messages.sessionId, sessionId),
          lt(messages.sequence, options.beforeSequence)
        )
      : eq(messages.sessionId, sessionId);

    const rows = db
      .select()
      .from(messages)
      .where(whereClause)
      .orderBy(desc(messages.sequence))
      .limit(limit + 1)
      .all();

    const hasMore = rows.length > limit;
    const resultMessages = hasMore ? rows.slice(0, limit) : rows;

    return { messages: resultMessages, hasMore, totalCount };
  }

  getAfterTimestamp(sessionId: string, timestamp: Date, limit = 100): MessageRow[] {
    const db = getDatabase();
    return db
      .select()
      .from(messages)
      .where(and(eq(messages.sessionId, sessionId), gt(messages.createdAt, timestamp)))
      .orderBy(messages.createdAt)
      .limit(limit)
      .all();
  }

  /**
   * Updates message completion status.
   */
  markComplete(messageId: string): void {
    const db = getDatabase();
    db.update(messages)
      .set({ isComplete: true })
      .where(eq(messages.id, messageId))
      .run();
  }

  /**
   * Updates message audio output path.
   */
  setAudioOutput(messageId: string, audioPath: string): void {
    const db = getDatabase();
    db.update(messages)
      .set({ audioOutputPath: audioPath })
      .where(eq(messages.id, messageId))
      .run();
  }

  /**
   * Updates message content blocks (JSON string).
   */
  updateContentBlocks(messageId: string, contentBlocks: string): void {
    const db = getDatabase();
    db.update(messages)
      .set({ contentBlocks })
      .where(eq(messages.id, messageId))
      .run();
  }

  /**
   * Gets the last message for a session.
   */
  getLastBySession(sessionId: string): MessageRow | undefined {
    const db = getDatabase();
    return db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.sequence))
      .limit(1)
      .get();
  }

  /**
   * Gets a message by ID.
   */
  getById(messageId: string): MessageRow | undefined {
    const db = getDatabase();
    return db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .get();
  }

  /**
   * Deletes all messages for a session.
   */
  deleteBySession(sessionId: string): void {
    const db = getDatabase();
    db.delete(messages).where(eq(messages.sessionId, sessionId)).run();
  }
}

