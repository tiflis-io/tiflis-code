/**
 * @file version.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

/**
 * Reads the tunnel server version from package.json.
 */
export function getTunnelVersion(): string {
  try {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    // Try multiple possible locations for package.json
    // - "../package.json" works when running from dist/ (compiled)
    // - "../../package.json" works when running from src/utils/ (development)
    const possiblePaths = [
      join(__dirname, '../package.json'),
      join(__dirname, '../../package.json'),
    ];
    for (const packageJsonPath of possiblePaths) {
      try {
        const packageJsonContent = readFileSync(packageJsonPath, 'utf8');
        const packageJson = JSON.parse(packageJsonContent) as {
          version?: string;
          name?: string;
        };
        // Verify it's the correct package.json by checking the name
        if (
          packageJson.name === '@tiflis-io/tiflis-code-tunnel' &&
          typeof packageJson.version === 'string' &&
          packageJson.version.length > 0
        ) {
          return packageJson.version;
        }
      } catch {
        // Try next path
      }
    }
    return 'unknown';
  } catch (error) {
    console.error('Failed to read tunnel version from package.json:', error);
    return 'unknown';
  }
}

