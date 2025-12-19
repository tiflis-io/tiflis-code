/**
 * @file mock-supervisor-agent.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Mock Supervisor Agent for screenshot automation tests.
 * Returns fixture-based responses with simulated streaming.
 */

import { EventEmitter } from "events";
import type { Logger } from "pino";
import type { ContentBlock } from "../../domain/value-objects/content-block.js";
import {
  createTextBlock,
  createStatusBlock,
} from "../../domain/value-objects/content-block.js";
import { loadFixture, findMatchingResponse } from "./fixture-loader.js";
import { simulateStreaming } from "./streaming-simulator.js";
import type { MockFixture } from "./types.js";

/**
 * Configuration for MockSupervisorAgent.
 */
export interface MockSupervisorAgentConfig {
  logger: Logger;
  /** Optional custom fixtures path */
  fixturesPath?: string;
}

/**
 * Result from mock supervisor execution.
 */
export interface MockSupervisorResult {
  output: string;
  sessionId?: string;
}

/**
 * Mock Supervisor Agent for screenshot automation.
 *
 * This agent returns pre-defined responses from fixtures,
 * simulating realistic streaming behavior for UI screenshots.
 */
export class MockSupervisorAgent extends EventEmitter {
  private readonly logger: Logger;
  private readonly fixturesPath?: string;
  private readonly fixture: MockFixture | null;
  private conversationHistory: { role: "user" | "assistant"; content: string }[] = [];
  private isExecuting = false;
  private isProcessingCommand = false;
  private isCancelled = false;
  private abortController: AbortController | null = null;

  constructor(config: MockSupervisorAgentConfig) {
    super();
    this.logger = config.logger.child({ component: "MockSupervisorAgent" });
    this.fixturesPath = config.fixturesPath;

    // Load supervisor fixture
    this.fixture = loadFixture("supervisor", this.fixturesPath);

    if (this.fixture) {
      this.logger.info(
        { scenarios: Object.keys(this.fixture.scenarios).length },
        "Mock Supervisor Agent initialized with fixtures"
      );
    } else {
      this.logger.warn(
        "Mock Supervisor Agent initialized without fixtures - will return default responses"
      );
    }
  }

  /**
   * Executes a command (non-streaming).
   */
  async execute(
    command: string,
    deviceId: string,
    _currentSessionId?: string
  ): Promise<MockSupervisorResult> {
    this.logger.info({ command, deviceId }, "Mock supervisor execute");

    const response = this.getResponse(command);

    // Add to history
    this.conversationHistory.push({ role: "user", content: command });
    this.conversationHistory.push({ role: "assistant", content: response.text });

    return {
      output: response.text,
    };
  }

  /**
   * Executes a command with simulated streaming.
   */
  async executeWithStream(command: string, deviceId: string): Promise<void> {
    this.logger.info({ command, deviceId }, "Mock supervisor executeWithStream");

    this.abortController = new AbortController();
    this.isExecuting = true;
    this.isCancelled = false;

    try {
      const response = this.getResponse(command);

      // Emit status block
      if (this.isExecuting && !this.isCancelled) {
        const statusBlock = createStatusBlock("Processing...");
        this.emit("blocks", deviceId, [statusBlock], false);
      }

      // Small delay before starting
      await this.sleep(100);

      // Simulate streaming
      const allBlocks: ContentBlock[] = [];

      await simulateStreaming(
        response.text,
        response.delay_ms ?? 30,
        (blocks, isComplete) => {
          if (this.isExecuting && !this.isCancelled) {
            this.emit("blocks", deviceId, blocks, false);
            if (isComplete) {
              allBlocks.push(...blocks);
            }
          }
        },
        () => {
          // Streaming complete
        }
      );

      // Emit completion
      if (this.isExecuting && !this.isCancelled) {
        // Add to history
        this.conversationHistory.push({ role: "user", content: command });
        this.conversationHistory.push({
          role: "assistant",
          content: response.text,
        });

        const completionBlock = createStatusBlock("Complete");
        this.emit(
          "blocks",
          deviceId,
          [completionBlock],
          true,
          response.text,
          allBlocks
        );
      }
    } catch (error) {
      if (this.isCancelled) {
        this.logger.info({ deviceId }, "Mock supervisor cancelled");
        return;
      }

      this.logger.error({ error, command }, "Mock supervisor error");
      const errorBlock = createTextBlock(
        error instanceof Error ? error.message : "An error occurred"
      );
      this.emit("blocks", deviceId, [errorBlock], true);
    } finally {
      this.isExecuting = false;
      this.abortController = null;
    }
  }

  /**
   * Gets the response for a command from fixtures.
   */
  private getResponse(command: string): { text: string; delay_ms?: number } {
    if (!this.fixture) {
      return {
        text: "I'm the Supervisor agent. I can help you manage workspaces, sessions, and more. What would you like to do?",
        delay_ms: 30,
      };
    }

    return findMatchingResponse(this.fixture, command);
  }

  /**
   * Cancels current execution.
   */
  cancel(): boolean {
    if (!this.isProcessingCommand && !this.isExecuting) {
      return false;
    }

    this.logger.info("Cancelling mock supervisor execution");
    this.isCancelled = true;
    this.isExecuting = false;
    this.isProcessingCommand = false;

    if (this.abortController) {
      this.abortController.abort();
    }

    return true;
  }

  /**
   * Check if execution was cancelled.
   */
  wasCancelled(): boolean {
    return this.isCancelled;
  }

  /**
   * Starts command processing.
   */
  startProcessing(): AbortController {
    this.abortController = new AbortController();
    this.isProcessingCommand = true;
    this.isCancelled = false;
    return this.abortController;
  }

  /**
   * Checks if processing is active.
   */
  isProcessing(): boolean {
    return this.isProcessingCommand || this.isExecuting;
  }

  /**
   * Ends command processing.
   */
  endProcessing(): void {
    this.isProcessingCommand = false;
  }

  /**
   * Clears conversation history.
   */
  clearHistory(): void {
    this.conversationHistory = [];
    this.isCancelled = false;
    this.logger.info("Mock conversation history cleared");
  }

  /**
   * Resets cancellation state.
   */
  resetCancellationState(): void {
    this.isCancelled = false;
  }

  /**
   * Restores conversation history.
   */
  restoreHistory(
    history: { role: "user" | "assistant"; content: string }[]
  ): void {
    this.conversationHistory = history.slice(-20);
  }

  /**
   * Gets conversation history.
   */
  getConversationHistory(): { role: "user" | "assistant"; content: string }[] {
    return [...this.conversationHistory];
  }

  /**
   * Sleep utility.
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
