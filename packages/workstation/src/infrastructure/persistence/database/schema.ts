/**
 * @file schema.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

/**
 * Sessions table - stores session metadata.
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  type: text('type').notNull(), // 'supervisor' | 'cursor' | 'claude' | 'opencode' | 'terminal'
  workspace: text('workspace'),
  project: text('project'),
  worktree: text('worktree'),
  workingDir: text('working_dir').notNull(),
  status: text('status').notNull(), // 'active' | 'terminated'
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  terminatedAt: integer('terminated_at', { mode: 'timestamp' }),
});

/**
 * Messages table - stores conversation history.
 */
export const messages = sqliteTable('messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  role: text('role').notNull(), // 'user' | 'assistant' | 'system'
  contentType: text('content_type').notNull(), // 'text' | 'audio' | 'transcription'
  content: text('content').notNull(),
  audioInputPath: text('audio_input_path'),
  audioOutputPath: text('audio_output_path'),
  isComplete: integer('is_complete', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Subscriptions table - tracks client subscriptions for recovery.
 */
export const subscriptions = sqliteTable('subscriptions', {
  id: text('id').primaryKey(),
  deviceId: text('device_id').notNull(),
  sessionId: text('session_id')
    .notNull()
    .references(() => sessions.id),
  subscribedAt: integer('subscribed_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Workstation metadata table - stores persistent workstation configuration.
 * Singleton table (only one row with id='workstation').
 */
export const workstationMetadata = sqliteTable('workstation_metadata', {
  id: text('id').primaryKey().default('workstation'), // Singleton row
  tunnelId: text('tunnel_id'), // Persistent tunnel ID (workstation ID)
  publicUrl: text('public_url'), // Public WebSocket URL
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

/**
 * Type definitions for database rows.
 */
export type SessionRow = typeof sessions.$inferSelect;
export type NewSessionRow = typeof sessions.$inferInsert;

export type MessageRow = typeof messages.$inferSelect;
export type NewMessageRow = typeof messages.$inferInsert;

export type SubscriptionRow = typeof subscriptions.$inferSelect;
export type NewSubscriptionRow = typeof subscriptions.$inferInsert;

export type WorkstationMetadataRow = typeof workstationMetadata.$inferSelect;
export type NewWorkstationMetadataRow = typeof workstationMetadata.$inferInsert;

