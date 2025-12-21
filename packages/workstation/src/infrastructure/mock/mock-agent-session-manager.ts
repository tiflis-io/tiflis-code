/**
 * @file mock-agent-session-manager.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Mock Agent Session Manager for screenshot automation tests.
 * Simulates agent sessions with fixture-based responses and streaming.
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import type { Logger } from "pino";
import type { ContentBlock } from "../../domain/value-objects/content-block.js";
import {
  createTextBlock,
  createStatusBlock,
} from "../../domain/value-objects/content-block.js";
import type { AgentType } from "../../domain/entities/agent-session.js";
import { loadFixture, findMatchingResponse } from "./fixture-loader.js";
import { simulateStreaming } from "./streaming-simulator.js";
import type { MockFixture } from "./types.js";

/**
 * A stored message with its content blocks.
 */
export interface StoredMessage {
  id: string;
  timestamp: number;
  role: "user" | "assistant" | "system";
  blocks: ContentBlock[];
}

/**
 * State of a mock agent session.
 */
export interface MockAgentSessionState {
  sessionId: string;
  agentType: AgentType;
  agentName: string;
  workingDir: string;
  cliSessionId: string | null;
  isExecuting: boolean;
  isCancelled: boolean;
  messages: StoredMessage[];
  createdAt: number;
  lastActivityAt: number;
}

/**
 * Configuration for MockAgentSessionManager.
 */
export interface MockAgentSessionManagerConfig {
  logger: Logger;
  fixturesPath?: string;
}

/**
 * Mock Agent Session Manager for screenshot automation.
 *
 * This manager creates mock agent sessions that return
 * pre-defined responses from fixtures with simulated streaming.
 */
export class MockAgentSessionManager extends EventEmitter {
  private sessions = new Map<string, MockAgentSessionState>();
  private fixtures = new Map<string, MockFixture | null>();
  private logger: Logger;
  private fixturesPath?: string;

  constructor(config: MockAgentSessionManagerConfig) {
    super();
    this.logger = config.logger.child({ component: "MockAgentSessionManager" });
    this.fixturesPath = config.fixturesPath;

    // Pre-load fixtures for each agent type
    this.loadAgentFixtures();

    this.logger.info("Mock Agent Session Manager initialized");
  }

  /**
   * Pre-load fixtures for all agent types.
   */
  private loadAgentFixtures(): void {
    const agentTypes: AgentType[] = ["cursor", "claude", "opencode"];

    for (const agentType of agentTypes) {
      const fixture = loadFixture(agentType, this.fixturesPath);
      this.fixtures.set(agentType, fixture);

      if (fixture) {
        this.logger.debug(
          { agentType, scenarios: Object.keys(fixture.scenarios).length },
          "Loaded fixture for agent type"
        );
      }
    }
  }

  /**
   * Create a new mock agent session.
   */
  createSession(
    agentType: AgentType,
    workingDir: string,
    sessionId?: string,
    agentName?: string
  ): MockAgentSessionState {
    const id = sessionId ?? `agent-${randomUUID()}`;
    const resolvedAgentName = agentName ?? agentType;

    const state: MockAgentSessionState = {
      sessionId: id,
      agentType,
      agentName: resolvedAgentName,
      workingDir,
      cliSessionId: `mock-cli-${randomUUID().slice(0, 8)}`,
      isExecuting: false,
      isCancelled: false,
      messages: [],
      createdAt: Date.now(),
      lastActivityAt: Date.now(),
    };

    this.sessions.set(id, state);

    this.logger.info(
      { sessionId: id, agentType, agentName: resolvedAgentName, workingDir },
      "Mock agent session created"
    );

    this.emit("sessionCreated", state);

    // Also emit cliSessionIdDiscovered for consistency with real implementation
    this.emit("cliSessionIdDiscovered", id, state.cliSessionId);

    return state;
  }

  /**
   * Execute a command in a mock agent session with simulated streaming.
   */
  async executeCommand(sessionId: string, prompt: string): Promise<void> {
    const state = this.sessions.get(sessionId);

    if (!state) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    if (state.isExecuting) {
      this.cancelCommand(sessionId);
    }

    // Update state
    state.isExecuting = true;
    state.isCancelled = false;
    state.lastActivityAt = Date.now();

    // Add user message
    const userMessage: StoredMessage = {
      id: randomUUID(),
      timestamp: Date.now(),
      role: "user",
      blocks: [createTextBlock(prompt)],
    };
    state.messages.push(userMessage);

    try {
      // Get fixture for this agent type
      const fixture = this.fixtures.get(state.agentType);
      const response = fixture
        ? findMatchingResponse(fixture, prompt)
        : this.getDefaultResponse(state.agentType);

      // Small initial delay
      await this.sleep(150);

      // Simulate streaming
      const allBlocks: ContentBlock[] = [];

      await simulateStreaming(
        response.text,
        response.delay_ms ?? 30,
        (blocks, _isComplete) => {
          if (state.isExecuting && !state.isCancelled) {
            this.emit("blocks", sessionId, blocks, false);
          }
        },
        () => {
          // Streaming complete callback
        }
      );

      // Complete the response
      if (state.isExecuting && !state.isCancelled) {
        // Add assistant message to history
        const assistantMessage: StoredMessage = {
          id: randomUUID(),
          timestamp: Date.now(),
          role: "assistant",
          blocks: [createTextBlock(response.text)],
        };
        state.messages.push(assistantMessage);
        allBlocks.push(createTextBlock(response.text));

        // Send completion
        const completionBlocks = [createStatusBlock("Command completed")];
        const completionMsg: StoredMessage = {
          id: randomUUID(),
          timestamp: Date.now(),
          role: "system",
          blocks: completionBlocks,
        };
        state.messages.push(completionMsg);

        this.emit("blocks", sessionId, completionBlocks, true);
      }
    } catch (error) {
      if (!state.isCancelled) {
        this.logger.error({ sessionId, error }, "Mock command execution error");
        const errorBlocks = [
          createTextBlock(
            error instanceof Error ? error.message : "An error occurred"
          ),
        ];
        this.emit("blocks", sessionId, errorBlocks, true);
      }
    } finally {
      state.isExecuting = false;
      state.lastActivityAt = Date.now();
    }
  }

  /**
   * Get default response when no fixture is available.
   */
  private getDefaultResponse(agentType: AgentType): {
    text: string;
    delay_ms?: number;
  } {
    const responses: Record<AgentType, string> = {
      claude:
        "I'm Claude, an AI assistant. I can help you with coding tasks, answer questions, and assist with various development workflows. What would you like me to help you with?",
      cursor:
        "I'm Cursor AI, ready to help you write and edit code. I can assist with code completion, refactoring, and explaining complex code. What can I help you with today?",
      opencode:
        "I'm OpenCode, an open-source AI coding assistant. I can help with code generation, debugging, and documentation. How can I assist you?",
    };

    return {
      text: responses[agentType],
      delay_ms: 30,
    };
  }

  /**
   * Cancel current command execution.
   */
  cancelCommand(sessionId: string): void {
    const state = this.sessions.get(sessionId);

    if (!state?.isExecuting) {
      return;
    }

    this.logger.info({ sessionId }, "Cancelling mock command execution");

    state.isExecuting = false;
    state.isCancelled = true;
    state.lastActivityAt = Date.now();
  }

  /**
   * Clear chat history for a session.
   */
  clearHistory(sessionId: string): void {
    const state = this.sessions.get(sessionId);

    if (!state) {
      return;
    }

    state.messages = [];
    this.logger.info({ sessionId }, "Mock session history cleared");
  }

  /**
   * Terminate an agent session.
   */
  terminateSession(sessionId: string): void {
    this.sessions.delete(sessionId);

    this.logger.info({ sessionId }, "Mock agent session terminated");
    this.emit("sessionTerminated", sessionId);
  }

  /**
   * Get session state.
   */
  getSession(sessionId: string): MockAgentSessionState | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions.
   */
  listSessions(): MockAgentSessionState[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get chat history for a session.
   */
  getMessages(sessionId: string): StoredMessage[] {
    return this.sessions.get(sessionId)?.messages ?? [];
  }

  /**
   * Check if a session is executing.
   */
  isExecuting(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isExecuting ?? false;
  }

  /**
   * Check if a session was cancelled.
   */
  wasCancelled(sessionId: string): boolean {
    return this.sessions.get(sessionId)?.isCancelled ?? false;
  }

  /**
   * Cleanup all sessions.
   */
  cleanup(): void {
    const sessionIds = Array.from(this.sessions.keys());
    for (const id of sessionIds) {
      this.terminateSession(id);
    }
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
