/**
 * @file drizzle.config.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { defineConfig } from 'drizzle-kit';
import { homedir } from 'os';
import { join } from 'path';

const dataDir = process.env.DATA_DIR ?? join(homedir(), '.tiflis-code');

export default defineConfig({
  schema: './src/infrastructure/persistence/database/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: join(dataDir, 'tiflis.db'),
  },
});

