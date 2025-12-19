/**
 * @file types.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Type definitions for mock mode infrastructure.
 */

/**
 * A single response scenario with trigger patterns and response configuration.
 */
export interface MockScenario {
  /** Trigger patterns (case-insensitive substring match) */
  triggers: string[];
  /** Response configuration */
  response: MockResponse;
}

/**
 * Mock response configuration.
 */
export interface MockResponse {
  /** Text content to return */
  text: string;
  /** Delay between characters in milliseconds (for streaming simulation) */
  delay_ms?: number;
  /** Optional actions to perform (e.g., create session) */
  actions?: MockAction[];
}

/**
 * Mock action that can be triggered by a response.
 */
export interface MockAction {
  type: "create_session" | "terminate_session" | "list_sessions";
  agent?: string;
  workspace?: string;
  project?: string;
  session_id?: string;
}

/**
 * Fixture file format for supervisor/agent responses.
 */
export interface MockFixture {
  /** Named scenarios with trigger-based responses */
  scenarios: Record<string, MockScenario>;
  /** Default response when no scenario matches */
  default_response: MockResponse;
}

/**
 * Configuration for mock mode.
 */
export interface MockModeConfig {
  /** Whether mock mode is enabled */
  enabled: boolean;
  /** Path to fixtures directory */
  fixturesPath?: string;
}
