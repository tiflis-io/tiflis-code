/**
 * @file message-repository.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { eq, desc, gt, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '../database/client.js';
import { messages, type MessageRow, type NewMessageRow } from '../database/schema.js';

export interface CreateMessageParams {
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  contentType: 'text' | 'audio' | 'transcription';
  content: string;
  audioInputPath?: string;
  audioOutputPath?: string;
  isComplete?: boolean;
}

/**
 * Repository for message persistence operations.
 */
export class MessageRepository {
  /**
   * Creates a new message.
   */
  create(params: CreateMessageParams): MessageRow {
    const db = getDatabase();
    const newMessage: NewMessageRow = {
      id: nanoid(16),
      sessionId: params.sessionId,
      role: params.role,
      contentType: params.contentType,
      content: params.content,
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
   */
  getBySession(sessionId: string, limit = 100): MessageRow[] {
    const db = getDatabase();
    return db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.createdAt))
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
   * Deletes all messages for a session.
   */
  deleteBySession(sessionId: string): void {
    const db = getDatabase();
    db.delete(messages).where(eq(messages.sessionId, sessionId)).run();
  }
}

