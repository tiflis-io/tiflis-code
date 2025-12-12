/**
 * @file message-repository.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { eq, desc, gt, and, max } from 'drizzle-orm';
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
      id: nanoid(16),
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

  /**
   * Gets messages for a session with pagination.
   * Returns messages ordered by sequence descending (newest first).
   */
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

  /**
   * Gets messages after a specific timestamp.
   */
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

