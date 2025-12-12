/**
 * @file version.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Reads the tunnel server version from package.json.
 */
export function getTunnelVersion(): string {
  try {
    const packageJsonPath = join(process.cwd(), 'package.json');
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as {
      version: string;
    };
    return packageJson.version;
  } catch (error) {
    console.error('Failed to read tunnel version from package.json:', error);
    return 'unknown';
  }
}

