/**
 * @file session-repository.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { eq } from 'drizzle-orm';
import { getDatabase } from '../database/client.js';
import { sessions, type SessionRow, type NewSessionRow } from '../database/schema.js';
export interface CreateSessionParams {
  id: string;
  /** Session type or agent alias name (e.g., 'cursor', 'claude', 'zai') */
  type: string;
  workspace?: string;
  project?: string;
  worktree?: string;
  workingDir: string;
}

/**
 * Repository for session persistence operations.
 */
export class SessionRepository {
  /**
   * Creates a new session record or updates if exists.
   */
  create(params: CreateSessionParams): SessionRow {
    const db = getDatabase();
    const newSession: NewSessionRow = {
      id: params.id,
      type: params.type,
      workspace: params.workspace,
      project: params.project,
      worktree: params.worktree,
      workingDir: params.workingDir,
      status: 'active',
      createdAt: new Date(),
    };

    // Use INSERT OR REPLACE to handle existing sessions (e.g., restored from persistence)
    db.insert(sessions)
      .values(newSession)
      .onConflictDoUpdate({
        target: sessions.id,
        set: {
          status: 'active',
          terminatedAt: null,
        },
      })
      .run();
    return { ...newSession, terminatedAt: null, createdAt: newSession.createdAt } as SessionRow;
  }

  /**
   * Gets a session by ID.
   */
  getById(sessionId: string): SessionRow | undefined {
    const db = getDatabase();
    return db.select().from(sessions).where(eq(sessions.id, sessionId)).get();
  }

  /**
   * Gets all active sessions.
   */
  getActive(): SessionRow[] {
    const db = getDatabase();
    return db.select().from(sessions).where(eq(sessions.status, 'active')).all();
  }

  /**
   * Marks a session as terminated.
   */
  terminate(sessionId: string): void {
    const db = getDatabase();
    db.update(sessions)
      .set({
        status: 'terminated',
        terminatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .run();
  }

  /**
   * Deletes old terminated sessions (for cleanup).
   */
  deleteOldTerminated(_olderThan: Date): number {
    const db = getDatabase();
    const result = db
      .delete(sessions)
      .where(eq(sessions.status, 'terminated'))
      .run();
    return result.changes;
  }
}

