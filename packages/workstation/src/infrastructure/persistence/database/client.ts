/**
 * @file client.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { join } from 'path';
import { mkdirSync } from 'fs';
import * as schema from './schema.js';

export type DrizzleDatabase = BetterSQLite3Database<typeof schema>;

let db: DrizzleDatabase | null = null;
let sqlite: Database.Database | null = null;

/**
 * Initializes the database connection.
 */
export function initDatabase(dataDir: string): DrizzleDatabase {
  if (db) {
    return db;
  }

  // Ensure data directory exists
  mkdirSync(dataDir, { recursive: true });

  const dbPath = join(dataDir, 'tiflis.db');
  sqlite = new Database(dbPath);
  
  // Enable WAL mode for better concurrent access
  sqlite.pragma('journal_mode = WAL');
  
  // Create tables if they don't exist
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      workspace TEXT,
      project TEXT,
      worktree TEXT,
      working_dir TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      terminated_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      role TEXT NOT NULL,
      content_type TEXT NOT NULL,
      content TEXT NOT NULL,
      audio_input_path TEXT,
      audio_output_path TEXT,
      is_complete INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      id TEXT PRIMARY KEY,
      device_id TEXT NOT NULL,
      session_id TEXT NOT NULL REFERENCES sessions(id),
      subscribed_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_device_id ON subscriptions(device_id);
    CREATE INDEX IF NOT EXISTS idx_subscriptions_session_id ON subscriptions(session_id);
  `);

  db = drizzle(sqlite, { schema });
  return db;
}

/**
 * Gets the database instance.
 * Throws if database is not initialized.
 */
export function getDatabase(): DrizzleDatabase {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return db;
}

/**
 * Closes the database connection.
 */
export function closeDatabase(): void {
  if (sqlite) {
    sqlite.close();
    sqlite = null;
    db = null;
  }
}

