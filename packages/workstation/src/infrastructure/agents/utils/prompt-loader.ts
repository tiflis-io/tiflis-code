/**
 * @file prompt-loader.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export function loadSystemPrompt(
  promptName: string,
  envOverrideKey?: string
): string {
  if (envOverrideKey) {
    const envPath = process.env[envOverrideKey];
    if (envPath && existsSync(envPath)) {
      return readFileSync(envPath, 'utf-8');
    }
  }

  const fileName = `${promptName}.md`;
  const searchPaths = [
    join(process.cwd(), 'prompts', fileName),
    join(process.cwd(), 'packages/workstation/prompts', fileName),
  ];

  for (const path of searchPaths) {
    if (existsSync(path)) {
      return readFileSync(path, 'utf-8');
    }
  }

  throw new Error(`System prompt not found: ${promptName}`);
}
