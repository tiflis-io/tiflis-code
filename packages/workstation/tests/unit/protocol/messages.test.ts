/**
 * @file messages.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect } from "vitest";
import type {
  MessageAckMessage,
  OutgoingClientMessage,
  SessionExecuteMessage,
} from "../../../src/protocol/messages.js";

describe("MessageAckMessage", () => {
  describe("type structure", () => {
    it("should have correct type field", () => {
      const ack: MessageAckMessage = {
        type: "message.ack",
        payload: {
          message_id: "test-message-id",
          status: "received",
        },
      };

      expect(ack.type).toBe("message.ack");
    });

    it("should have required message_id field", () => {
      const ack: MessageAckMessage = {
        type: "message.ack",
        payload: {
          message_id: "uuid-12345-67890",
          status: "received",
        },
      };

      expect(ack.payload.message_id).toBe("uuid-12345-67890");
    });

    it("should have required status field", () => {
      const ack: MessageAckMessage = {
        type: "message.ack",
        payload: {
          message_id: "test-id",
          status: "received",
        },
      };

      expect(ack.payload.status).toBe("received");
    });

    it("should support 'processing' status", () => {
      const ack: MessageAckMessage = {
        type: "message.ack",
        payload: {
          message_id: "test-id",
          status: "processing",
        },
      };

      expect(ack.payload.status).toBe("processing");
    });

    it("should support 'queued' status", () => {
      const ack: MessageAckMessage = {
        type: "message.ack",
        payload: {
          message_id: "test-id",
          status: "queued",
        },
      };

      expect(ack.payload.status).toBe("queued");
    });
  });

  describe("session_id field", () => {
    it("should allow optional session_id for agent sessions", () => {
      const ack: MessageAckMessage = {
        type: "message.ack",
        payload: {
          message_id: "test-id",
          session_id: "agent-session-123",
          status: "received",
        },
      };

      expect(ack.payload.session_id).toBe("agent-session-123");
    });

    it("should allow undefined session_id for supervisor messages", () => {
      const ack: MessageAckMessage = {
        type: "message.ack",
        payload: {
          message_id: "test-id",
          status: "received",
        },
      };

      expect(ack.payload.session_id).toBeUndefined();
    });
  });

  describe("OutgoingClientMessage union", () => {
    it("should include MessageAckMessage in OutgoingClientMessage union", () => {
      const ack: MessageAckMessage = {
        type: "message.ack",
        payload: {
          message_id: "test-id",
          status: "received",
        },
      };

      // This assignment should compile if MessageAckMessage is in the union
      const outgoing: OutgoingClientMessage = ack;
      expect(outgoing.type).toBe("message.ack");
    });
  });
});

describe("SessionExecuteMessage", () => {
  describe("message_id support", () => {
    it("should support id field for message tracking", () => {
      const execute: SessionExecuteMessage = {
        type: "session.execute",
        id: "execute-message-123",
        session_id: "agent-session-456",
        payload: {
          text: "Hello, agent!",
        },
      };

      expect(execute.id).toBe("execute-message-123");
    });

    it("should support text payload", () => {
      const execute: SessionExecuteMessage = {
        type: "session.execute",
        id: "msg-1",
        session_id: "session-1",
        payload: {
          text: "Run the tests",
        },
      };

      expect(execute.payload.text).toBe("Run the tests");
    });

    it("should support audio payload with format", () => {
      const execute: SessionExecuteMessage = {
        type: "session.execute",
        id: "msg-2",
        session_id: "session-1",
        payload: {
          audio: "base64-encoded-audio-data",
          audio_format: "m4a",
        },
      };

      expect(execute.payload.audio).toBe("base64-encoded-audio-data");
      expect(execute.payload.audio_format).toBe("m4a");
    });
  });
});

describe("Message acknowledgment flow", () => {
  it("should support complete ack flow for supervisor command", () => {
    // 1. Client sends supervisor.command with id
    const commandId = "supervisor-cmd-001";

    // 2. Server responds with message.ack
    const ack: MessageAckMessage = {
      type: "message.ack",
      payload: {
        message_id: commandId,
        status: "received",
      },
    };

    expect(ack.payload.message_id).toBe(commandId);
    expect(ack.payload.session_id).toBeUndefined(); // Supervisor has no session
  });

  it("should support complete ack flow for session.execute", () => {
    // 1. Client sends session.execute with id
    const messageId = "session-exec-001";
    const sessionId = "agent-session-123";

    // 2. Server responds with message.ack
    const ack: MessageAckMessage = {
      type: "message.ack",
      payload: {
        message_id: messageId,
        session_id: sessionId,
        status: "received",
      },
    };

    expect(ack.payload.message_id).toBe(messageId);
    expect(ack.payload.session_id).toBe(sessionId);
  });
});
