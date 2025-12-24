/**
 * @file schemas.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect } from "vitest";
import {
  parseClientMessage,
  parseTunnelMessage,
  getMessageType,
  AuthPayloadSchema,
  AuthMessageSchema,
  PingSchema,
  HeartbeatSchema,
  SyncMessageSchema,
  CreateSessionPayloadSchema,
  SupervisorCommandPayloadSchema,
  SessionExecutePayloadSchema,
  SessionResizePayloadSchema,
  SessionReplayPayloadSchema,
  AudioRequestPayloadSchema,
  IncomingClientMessageSchema,
  IncomingTunnelMessageSchema,
} from "../../../src/protocol/schemas.js";

// ============================================================================
// parseClientMessage Tests
// ============================================================================

describe("parseClientMessage", () => {
  describe("valid messages", () => {
    it("should parse auth message", () => {
      const message = {
        type: "auth",
        payload: {
          auth_key: "1234567890123456",
          device_id: "device-123",
        },
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("auth");
    });

    it("should parse ping message", () => {
      const message = {
        type: "ping",
        timestamp: Date.now(),
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("ping");
    });

    it("should parse heartbeat message", () => {
      const message = {
        type: "heartbeat",
        id: "heartbeat-123",
        timestamp: Date.now(),
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("heartbeat");
    });

    it("should parse sync message", () => {
      const message = {
        type: "sync",
        id: "sync-123",
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("sync");
    });

    it("should parse sync message with lightweight flag", () => {
      const message = {
        type: "sync",
        id: "sync-123",
        lightweight: true,
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      if (result?.type === "sync") {
        expect(result.lightweight).toBe(true);
      }
    });

    it("should parse supervisor.command with text", () => {
      const message = {
        type: "supervisor.command",
        id: "cmd-123",
        payload: {
          command: "list sessions",
        },
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("supervisor.command");
    });

    it("should parse supervisor.command with audio", () => {
      const message = {
        type: "supervisor.command",
        id: "cmd-123",
        payload: {
          audio: "base64-audio-data",
          audio_format: "m4a",
        },
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("supervisor.command");
    });

    it("should parse session.execute with text", () => {
      const message = {
        type: "session.execute",
        id: "exec-123",
        session_id: "session-456",
        payload: {
          text: "run tests",
        },
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("session.execute");
    });

    it("should parse session.execute with content", () => {
      const message = {
        type: "session.execute",
        id: "exec-123",
        session_id: "session-456",
        payload: {
          content: "run tests",
        },
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("session.execute");
    });

    it("should parse session.input", () => {
      const message = {
        type: "session.input",
        session_id: "session-456",
        payload: {
          data: "ls -la\n",
        },
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("session.input");
    });

    it("should parse session.resize", () => {
      const message = {
        type: "session.resize",
        session_id: "session-456",
        payload: {
          cols: 120,
          rows: 40,
        },
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("session.resize");
    });

    it("should parse audio.request", () => {
      const message = {
        type: "audio.request",
        id: "audio-123",
        payload: {
          message_id: "msg-456",
          type: "output",
        },
      };

      const result = parseClientMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("audio.request");
    });
  });

  describe("invalid messages", () => {
    it("should return undefined for unknown message type", () => {
      const message = {
        type: "unknown.type",
        payload: {},
      };

      const result = parseClientMessage(message);
      expect(result).toBeUndefined();
    });

    it("should return undefined for missing required fields", () => {
      const message = {
        type: "auth",
        payload: {
          // Missing auth_key and device_id
        },
      };

      const result = parseClientMessage(message);
      expect(result).toBeUndefined();
    });

    it("should return undefined for null input", () => {
      const result = parseClientMessage(null);
      expect(result).toBeUndefined();
    });

    it("should return undefined for non-object input", () => {
      const result = parseClientMessage("not an object");
      expect(result).toBeUndefined();
    });
  });
});

// ============================================================================
// parseTunnelMessage Tests
// ============================================================================

describe("parseTunnelMessage", () => {
  describe("valid messages", () => {
    it("should parse workstation.registered message", () => {
      const message = {
        type: "workstation.registered",
        payload: {
          tunnel_id: "tunnel-123",
          public_url: "wss://tunnel.example.com/ws",
        },
      };

      const result = parseTunnelMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("workstation.registered");
    });

    it("should parse pong message", () => {
      const message = {
        type: "pong",
        timestamp: Date.now(),
      };

      const result = parseTunnelMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("pong");
    });

    it("should parse error message", () => {
      const message = {
        type: "error",
        payload: {
          code: "INVALID_API_KEY",
          message: "Invalid API key",
        },
      };

      const result = parseTunnelMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("error");
    });

    it("should parse client.disconnected message", () => {
      const message = {
        type: "client.disconnected",
        payload: {
          device_id: "device-123",
          tunnel_id: "tunnel-456",
        },
      };

      const result = parseTunnelMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("client.disconnected");
    });
  });

  describe("invalid messages", () => {
    it("should return undefined for unknown message type", () => {
      const message = {
        type: "unknown.tunnel.type",
        payload: {},
      };

      const result = parseTunnelMessage(message);
      expect(result).toBeUndefined();
    });
  });
});

// ============================================================================
// getMessageType Tests
// ============================================================================

describe("getMessageType", () => {
  it("should extract type from valid message", () => {
    const message = { type: "auth", payload: {} };
    expect(getMessageType(message)).toBe("auth");
  });

  it("should extract type from any object with type field", () => {
    const message = { type: "custom.type", data: "anything" };
    expect(getMessageType(message)).toBe("custom.type");
  });

  it("should return undefined for object without type", () => {
    const message = { payload: {} };
    expect(getMessageType(message)).toBeUndefined();
  });

  it("should return undefined for null", () => {
    expect(getMessageType(null)).toBeUndefined();
  });

  it("should return undefined for string", () => {
    expect(getMessageType("not an object")).toBeUndefined();
  });

  it("should return undefined for array", () => {
    expect(getMessageType([{ type: "auth" }])).toBeUndefined();
  });
});

// ============================================================================
// Individual Schema Tests
// ============================================================================

describe("AuthPayloadSchema", () => {
  it("should validate correct payload", () => {
    const payload = {
      auth_key: "1234567890123456",
      device_id: "device-123",
    };

    const result = AuthPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject auth_key shorter than 16 characters", () => {
    const payload = {
      auth_key: "short",
      device_id: "device-123",
    };

    const result = AuthPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject empty device_id", () => {
    const payload = {
      auth_key: "1234567890123456",
      device_id: "",
    };

    const result = AuthPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("CreateSessionPayloadSchema", () => {
  it("should validate correct payload", () => {
    const payload = {
      session_type: "claude",
      workspace: "tiflis",
      project: "tiflis-code",
    };

    const result = CreateSessionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with optional worktree", () => {
    const payload = {
      session_type: "cursor",
      workspace: "tiflis",
      project: "tiflis-code",
      worktree: "feature-branch",
    };

    const result = CreateSessionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with optional agent_name", () => {
    const payload = {
      session_type: "claude",
      agent_name: "zai",
      workspace: "tiflis",
      project: "tiflis-code",
    };

    const result = CreateSessionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject invalid session_type", () => {
    const payload = {
      session_type: "invalid",
      workspace: "tiflis",
      project: "tiflis-code",
    };

    const result = CreateSessionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should accept all valid session types", () => {
    const types = ["cursor", "claude", "opencode", "terminal"];
    for (const type of types) {
      const payload = {
        session_type: type,
        workspace: "tiflis",
        project: "tiflis-code",
      };
      const result = CreateSessionPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    }
  });

  it("should reject empty workspace", () => {
    const payload = {
      session_type: "claude",
      workspace: "",
      project: "tiflis-code",
    };

    const result = CreateSessionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject empty project", () => {
    const payload = {
      session_type: "claude",
      workspace: "tiflis",
      project: "",
    };

    const result = CreateSessionPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("SupervisorCommandPayloadSchema", () => {
  it("should validate with command", () => {
    const payload = { command: "list sessions" };
    const result = SupervisorCommandPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with audio", () => {
    const payload = { audio: "base64-audio", audio_format: "m4a" };
    const result = SupervisorCommandPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with both command and audio", () => {
    const payload = {
      command: "test",
      audio: "base64-audio",
      audio_format: "wav",
    };
    const result = SupervisorCommandPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject when neither command nor audio provided", () => {
    const payload = { message_id: "msg-123" };
    const result = SupervisorCommandPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should accept all valid audio formats", () => {
    const formats = ["m4a", "wav", "mp3"];
    for (const format of formats) {
      const payload = { audio: "base64", audio_format: format };
      const result = SupervisorCommandPayloadSchema.safeParse(payload);
      expect(result.success).toBe(true);
    }
  });

  it("should reject invalid audio format", () => {
    const payload = { audio: "base64", audio_format: "ogg" };
    const result = SupervisorCommandPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("SessionExecutePayloadSchema", () => {
  it("should validate with content", () => {
    const payload = { content: "run tests" };
    const result = SessionExecutePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with text (backward compat)", () => {
    const payload = { text: "run tests" };
    const result = SessionExecutePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with audio", () => {
    const payload = { audio: "base64-audio", audio_format: "m4a" };
    const result = SessionExecutePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject when no content, text, or audio provided", () => {
    const payload = { tts_enabled: true };
    const result = SessionExecutePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should validate with all optional fields", () => {
    const payload = {
      content: "test",
      message_id: "msg-123",
      language: "en",
      tts_enabled: true,
    };
    const result = SessionExecutePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });
});

describe("SessionResizePayloadSchema", () => {
  it("should validate correct dimensions", () => {
    const payload = { cols: 120, rows: 40 };
    const result = SessionResizePayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject cols less than 1", () => {
    const payload = { cols: 0, rows: 40 };
    const result = SessionResizePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject rows less than 1", () => {
    const payload = { cols: 80, rows: 0 };
    const result = SessionResizePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject non-integer cols", () => {
    const payload = { cols: 80.5, rows: 24 };
    const result = SessionResizePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject non-integer rows", () => {
    const payload = { cols: 80, rows: 24.5 };
    const result = SessionResizePayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("SessionReplayPayloadSchema", () => {
  it("should validate empty payload", () => {
    const payload = {};
    const result = SessionReplayPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with since_timestamp", () => {
    const payload = { since_timestamp: 1704067200000 };
    const result = SessionReplayPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with since_sequence", () => {
    const payload = { since_sequence: 100 };
    const result = SessionReplayPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate limit within bounds", () => {
    const payload = { limit: 500 };
    const result = SessionReplayPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject limit below 1", () => {
    const payload = { limit: 0 };
    const result = SessionReplayPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject limit above 1000", () => {
    const payload = { limit: 1001 };
    const result = SessionReplayPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

describe("AudioRequestPayloadSchema", () => {
  it("should validate with message_id only", () => {
    const payload = { message_id: "msg-123" };
    const result = AudioRequestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with type input", () => {
    const payload = { message_id: "msg-123", type: "input" };
    const result = AudioRequestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should validate with type output", () => {
    const payload = { message_id: "msg-123", type: "output" };
    const result = AudioRequestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject empty message_id", () => {
    const payload = { message_id: "" };
    const result = AudioRequestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject invalid type", () => {
    const payload = { message_id: "msg-123", type: "invalid" };
    const result = AudioRequestPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// Full Message Schema Tests
// ============================================================================

describe("IncomingClientMessageSchema", () => {
  const allMessageTypes = [
    { type: "auth", payload: { auth_key: "1234567890123456", device_id: "d1" } },
    { type: "ping", timestamp: 123 },
    { type: "heartbeat", id: "h1", timestamp: 123 },
    { type: "sync", id: "s1" },
    { type: "history.request", id: "hr1" },
    { type: "supervisor.list_sessions", id: "ls1" },
    {
      type: "supervisor.create_session",
      id: "cs1",
      payload: { session_type: "claude", workspace: "w", project: "p" },
    },
    {
      type: "supervisor.terminate_session",
      id: "ts1",
      payload: { session_id: "sid" },
    },
    { type: "supervisor.command", id: "sc1", payload: { command: "test" } },
    { type: "supervisor.cancel", id: "sca1" },
    { type: "supervisor.clear_context", id: "scc1" },
    { type: "session.subscribe", session_id: "sid" },
    { type: "session.unsubscribe", session_id: "sid" },
    {
      type: "session.execute",
      id: "se1",
      session_id: "sid",
      payload: { text: "test" },
    },
    { type: "session.cancel", id: "sec1", session_id: "sid" },
    { type: "session.input", session_id: "sid", payload: { data: "test" } },
    {
      type: "session.resize",
      session_id: "sid",
      payload: { cols: 80, rows: 24 },
    },
    { type: "session.replay", session_id: "sid", payload: {} },
    { type: "audio.request", id: "ar1", payload: { message_id: "m1" } },
  ];

  it.each(allMessageTypes)("should parse $type message", (message) => {
    const result = IncomingClientMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });
});

describe("IncomingTunnelMessageSchema", () => {
  const allMessageTypes = [
    {
      type: "workstation.registered",
      payload: { tunnel_id: "t1", public_url: "wss://example.com" },
    },
    { type: "pong", timestamp: 123 },
    { type: "error", payload: { code: "ERROR", message: "test" } },
    {
      type: "client.disconnected",
      payload: { device_id: "d1", tunnel_id: "t1" },
    },
  ];

  it.each(allMessageTypes)("should parse $type message", (message) => {
    const result = IncomingTunnelMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });
});
