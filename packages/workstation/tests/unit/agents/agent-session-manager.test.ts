/**
 * @file agent-session-manager.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentSessionManager } from "../../../src/infrastructure/agents/agent-session-manager.js";

describe("AgentSessionManager", () => {
  let sessionManager: AgentSessionManager;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    sessionManager = new AgentSessionManager(mockLogger);
  });

  describe("getSession", () => {
    it("should return undefined for non-existent session", () => {
      const result = sessionManager.getSession("non-existent");
      expect(result).toBeUndefined();
    });
  });

  describe("isExecuting", () => {
    it("should return false for non-existent session", () => {
      const result = sessionManager.isExecuting("non-existent");
      expect(result).toBe(false);
    });
  });

  describe("cleanup", () => {
    it("should be callable without errors", () => {
      expect(() => sessionManager.cleanup()).not.toThrow();
    });
  });

  describe("event emitter", () => {
    it("should be an EventEmitter", () => {
      expect(sessionManager.on).toBeDefined();
      expect(sessionManager.emit).toBeDefined();
      expect(sessionManager.removeListener).toBeDefined();
    });

    it("should emit events correctly", () => {
      const callback = vi.fn();
      sessionManager.on("blocks", callback);

      sessionManager.emit("blocks", "session-id", [], true);

      expect(callback).toHaveBeenCalledWith("session-id", [], true);
    });
  });
});
