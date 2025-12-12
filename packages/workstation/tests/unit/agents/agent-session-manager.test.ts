// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { AgentSessionManager } from "../agent-session-manager";
import type { AgentExecutor, AgentOutputParser } from "../types";

describe("AgentSessionManager", () => {
  let sessionManager: AgentSessionManager;
  let mockLogger: any;
  let mockExecutor: AgentExecutor;
  let mockParser: AgentOutputParser;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };

    mockExecutor = {
      isExecuting: vi.fn().mockReturnValue(false),
      wasCancelled: vi.fn().mockReturnValue(false),
      cancel: vi.fn(),
      cleanup: vi.fn(),
    } as AgentExecutor;

    mockParser = {
      parseBuffer: vi.fn().mockReturnValue([]),
      extractSessionId: vi.fn().mockReturnValue(null),
      finalize: vi.fn(),
    } as AgentOutputParser;

    sessionManager = new AgentSessionManager(mockLogger);
  });

  describe("getSession", () => {
    it("should return null for non-existent session", () => {
      const result = sessionManager.getSession("non-existent");
      expect(result).toBeNull();
    });

    it("should return session when it exists", () => {
      const sessionId = "test-session";
      sessionManager.sessions.set(sessionId, {
        id: sessionId,
        type: "claude",
        workspace: "test",
        project: "test",
        status: "idle",
        createdAt: new Date(),
      });

      const result = sessionManager.getSession(sessionId);
      expect(result).toEqual({
        id: sessionId,
        type: "claude",
        workspace: "test",
        project: "test",
        status: "idle",
        createdAt: expect.any(Date),
      });
    });
  });

  describe("isExecuting", () => {
    it("should return false for non-existent session", () => {
      const result = sessionManager.isExecuting("non-existent");
      expect(result).toBe(false);
    });

    it("should return executor's isExecuting value", () => {
      const sessionId = "test-session";
      mockExecutor.isExecuting.mockReturnValue(true);
      sessionManager.executors.set(sessionId, mockExecutor);

      const result = sessionManager.isExecuting(sessionId);
      expect(result).toBe(true);
    });
  });

  describe("wasCancelled", () => {
    it("should return false for non-existent session", () => {
      const result = sessionManager.wasCancelled("non-existent");
      expect(result).toBe(false);
    });

    it("should return executor's wasCancelled value", () => {
      const sessionId = "test-session";
      mockExecutor.wasCancelled.mockReturnValue(true);
      sessionManager.executors.set(sessionId, mockExecutor);

      const result = sessionManager.wasCancelled(sessionId);
      expect(result).toBe(true);
    });
  });

  describe("cleanup", () => {
    it("should cancel all executing executors", () => {
      const sessionId1 = "session1";
      const sessionId2 = "session2";

      const executor1 = {
        ...mockExecutor,
        isExecuting: vi.fn().mockReturnValue(true),
      };
      const executor2 = {
        ...mockExecutor,
        isExecuting: vi.fn().mockReturnValue(false),
      };

      sessionManager.executors.set(sessionId1, executor1);
      sessionManager.executors.set(sessionId2, executor2);

      sessionManager.cleanup();

      expect(executor1.cancel).toHaveBeenCalled();
      expect(executor2.cancel).not.toHaveBeenCalled();
    });

    it("should cleanup all executors", () => {
      const sessionId1 = "session1";
      const sessionId2 = "session2";

      sessionManager.executors.set(sessionId1, mockExecutor);
      sessionManager.executors.set(sessionId2, mockExecutor);

      sessionManager.cleanup();

      expect(mockExecutor.cleanup).toHaveBeenCalledTimes(2);
    });

    it("should clear all maps", () => {
      // Add some data
      sessionManager.sessions.set("session1", {} as any);
      sessionManager.executors.set("session1", mockExecutor);
      sessionManager.parsers.set("session1", mockParser);
      sessionManager.buffers.set("session1", []);

      sessionManager.cleanup();

      expect(sessionManager.sessions.size).toBe(0);
      expect(sessionManager.executors.size).toBe(0);
      expect(sessionManager.parsers.size).toBe(0);
      expect(sessionManager.buffers.size).toBe(0);
    });
  });
});
