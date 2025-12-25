/**
 * @file fixture-loader.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Loads and parses JSON fixture files for mock mode.
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { MockFixture, MockResponse } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Default fixtures path (built-in fixtures shipped with the package).
 */
const DEFAULT_FIXTURES_PATH = join(__dirname, "fixtures");

/**
 * Cache for loaded fixtures to avoid repeated file reads.
 */
const fixtureCache = new Map<string, MockFixture>();

/**
 * Loads a fixture file by name.
 *
 * @param name - Fixture name (e.g., "supervisor", "claude")
 * @param customPath - Optional custom fixtures directory path
 * @returns Parsed fixture or null if not found
 */
export function loadFixture(
  name: string,
  customPath?: string
): MockFixture | null {
  const cacheKey = `${customPath ?? "default"}:${name}`;

  const cached = fixtureCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const fixturesDir = customPath ?? DEFAULT_FIXTURES_PATH;
  const filePath = join(fixturesDir, `${name}.json`);

  if (!existsSync(filePath)) {
    console.warn(`[MockMode] Fixture not found: ${filePath}`);
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    const fixture = JSON.parse(content) as MockFixture;
    fixtureCache.set(cacheKey, fixture);
    return fixture;
  } catch (error) {
    console.error(`[MockMode] Failed to load fixture ${filePath}:`, error);
    return null;
  }
}

/**
 * Finds a matching response for the given input text.
 *
 * @param fixture - The fixture to search in
 * @param input - User input text
 * @returns Matching response or default response
 */
export function findMatchingResponse(
  fixture: MockFixture,
  input: string
): MockResponse {
  const normalizedInput = input.toLowerCase().trim();

  // Search through scenarios for a matching trigger
  for (const scenario of Object.values(fixture.scenarios)) {
    for (const trigger of scenario.triggers) {
      if (normalizedInput.includes(trigger.toLowerCase())) {
        return scenario.response;
      }
    }
  }

  // Return default response if no match found
  return fixture.default_response;
}

/**
 * Clears the fixture cache (useful for testing).
 */
export function clearFixtureCache(): void {
  fixtureCache.clear();
}

/**
 * Gets the default fixtures path.
 */
export function getDefaultFixturesPath(): string {
  return DEFAULT_FIXTURES_PATH;
}
