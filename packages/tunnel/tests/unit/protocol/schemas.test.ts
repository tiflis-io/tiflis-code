/**
 * @file schemas.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect } from "vitest";
import {
  parseMessage,
  getMessageType,
  WorkstationRegisterPayloadSchema,
  WorkstationRegisterSchema,
  ConnectPayloadSchema,
  ConnectSchema,
  PingSchema,
  PongSchema,
  ForwardToDeviceSchema,
  IncomingMessageSchema,
} from "../../../src/protocol/schemas.js";

// ============================================================================
// parseMessage Tests
// ============================================================================

describe("parseMessage", () => {
  describe("valid messages", () => {
    it("should parse workstation.register message", () => {
      const message = {
        type: "workstation.register",
        payload: {
          api_key: "12345678901234567890123456789012",
          name: "My Workstation",
          auth_key: "1234567890123456",
        },
      };

      const result = parseMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("workstation.register");
    });

    it("should parse workstation.register with reconnect info", () => {
      const message = {
        type: "workstation.register",
        payload: {
          api_key: "12345678901234567890123456789012",
          name: "My Workstation",
          auth_key: "1234567890123456",
          reconnect: true,
          previous_tunnel_id: "tunnel-abc123",
        },
      };

      const result = parseMessage(message);
      expect(result).toBeDefined();
      if (result?.type === "workstation.register") {
        expect(result.payload.reconnect).toBe(true);
        expect(result.payload.previous_tunnel_id).toBe("tunnel-abc123");
      }
    });

    it("should parse connect message", () => {
      const message = {
        type: "connect",
        payload: {
          tunnel_id: "tunnel-123",
          auth_key: "1234567890123456",
          device_id: "device-456",
        },
      };

      const result = parseMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("connect");
    });

    it("should parse connect with reconnect flag", () => {
      const message = {
        type: "connect",
        payload: {
          tunnel_id: "tunnel-123",
          auth_key: "1234567890123456",
          device_id: "device-456",
          reconnect: true,
        },
      };

      const result = parseMessage(message);
      expect(result).toBeDefined();
      if (result?.type === "connect") {
        expect(result.payload.reconnect).toBe(true);
      }
    });

    it("should parse ping message", () => {
      const message = {
        type: "ping",
        timestamp: Date.now(),
      };

      const result = parseMessage(message);
      expect(result).toBeDefined();
      expect(result?.type).toBe("ping");
    });
  });

  describe("invalid messages", () => {
    it("should return undefined for unknown message type", () => {
      const message = {
        type: "unknown.type",
        payload: {},
      };

      const result = parseMessage(message);
      expect(result).toBeUndefined();
    });

    it("should return undefined for null", () => {
      const result = parseMessage(null);
      expect(result).toBeUndefined();
    });

    it("should return undefined for non-object", () => {
      const result = parseMessage("not an object");
      expect(result).toBeUndefined();
    });

    it("should return undefined for missing required fields", () => {
      const message = {
        type: "workstation.register",
        payload: {
          // Missing api_key, name, auth_key
        },
      };

      const result = parseMessage(message);
      expect(result).toBeUndefined();
    });
  });
});

// ============================================================================
// getMessageType Tests
// ============================================================================

describe("getMessageType", () => {
  it("should extract type from valid message", () => {
    const message = { type: "connect", payload: {} };
    expect(getMessageType(message)).toBe("connect");
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
    expect(getMessageType([{ type: "connect" }])).toBeUndefined();
  });

  it("should return undefined for number", () => {
    expect(getMessageType(42)).toBeUndefined();
  });
});

// ============================================================================
// WorkstationRegisterPayloadSchema Tests
// ============================================================================

describe("WorkstationRegisterPayloadSchema", () => {
  it("should validate correct payload", () => {
    const payload = {
      api_key: "12345678901234567890123456789012",
      name: "My Workstation",
      auth_key: "1234567890123456",
    };

    const result = WorkstationRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject api_key shorter than 32 characters", () => {
    const payload = {
      api_key: "short-key",
      name: "My Workstation",
      auth_key: "1234567890123456",
    };

    const result = WorkstationRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("32 characters");
    }
  });

  it("should accept api_key exactly 32 characters", () => {
    const payload = {
      api_key: "12345678901234567890123456789012",
      name: "My Workstation",
      auth_key: "1234567890123456",
    };

    const result = WorkstationRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject auth_key shorter than 16 characters", () => {
    const payload = {
      api_key: "12345678901234567890123456789012",
      name: "My Workstation",
      auth_key: "short",
    };

    const result = WorkstationRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("16 characters");
    }
  });

  it("should reject empty name", () => {
    const payload = {
      api_key: "12345678901234567890123456789012",
      name: "",
      auth_key: "1234567890123456",
    };

    const result = WorkstationRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should accept optional reconnect flag", () => {
    const payload = {
      api_key: "12345678901234567890123456789012",
      name: "My Workstation",
      auth_key: "1234567890123456",
      reconnect: true,
    };

    const result = WorkstationRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reconnect).toBe(true);
    }
  });

  it("should accept optional previous_tunnel_id", () => {
    const payload = {
      api_key: "12345678901234567890123456789012",
      name: "My Workstation",
      auth_key: "1234567890123456",
      previous_tunnel_id: "tunnel-abc123",
    };

    const result = WorkstationRegisterPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.previous_tunnel_id).toBe("tunnel-abc123");
    }
  });
});

// ============================================================================
// ConnectPayloadSchema Tests
// ============================================================================

describe("ConnectPayloadSchema", () => {
  it("should validate correct payload", () => {
    const payload = {
      tunnel_id: "tunnel-123",
      auth_key: "1234567890123456",
      device_id: "device-456",
    };

    const result = ConnectPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
  });

  it("should reject empty tunnel_id", () => {
    const payload = {
      tunnel_id: "",
      auth_key: "1234567890123456",
      device_id: "device-456",
    };

    const result = ConnectPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject auth_key shorter than 16 characters", () => {
    const payload = {
      tunnel_id: "tunnel-123",
      auth_key: "short",
      device_id: "device-456",
    };

    const result = ConnectPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should reject empty device_id", () => {
    const payload = {
      tunnel_id: "tunnel-123",
      auth_key: "1234567890123456",
      device_id: "",
    };

    const result = ConnectPayloadSchema.safeParse(payload);
    expect(result.success).toBe(false);
  });

  it("should accept optional reconnect flag", () => {
    const payload = {
      tunnel_id: "tunnel-123",
      auth_key: "1234567890123456",
      device_id: "device-456",
      reconnect: true,
    };

    const result = ConnectPayloadSchema.safeParse(payload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reconnect).toBe(true);
    }
  });
});

// ============================================================================
// PingSchema and PongSchema Tests
// ============================================================================

describe("PingSchema", () => {
  it("should validate correct ping message", () => {
    const message = {
      type: "ping",
      timestamp: 1704067200000,
    };

    const result = PingSchema.safeParse(message);
    expect(result.success).toBe(true);
  });

  it("should reject missing timestamp", () => {
    const message = {
      type: "ping",
    };

    const result = PingSchema.safeParse(message);
    expect(result.success).toBe(false);
  });

  it("should reject non-number timestamp", () => {
    const message = {
      type: "ping",
      timestamp: "not a number",
    };

    const result = PingSchema.safeParse(message);
    expect(result.success).toBe(false);
  });
});

describe("PongSchema", () => {
  it("should validate correct pong message", () => {
    const message = {
      type: "pong",
      timestamp: 1704067200000,
    };

    const result = PongSchema.safeParse(message);
    expect(result.success).toBe(true);
  });

  it("should reject missing timestamp", () => {
    const message = {
      type: "pong",
    };

    const result = PongSchema.safeParse(message);
    expect(result.success).toBe(false);
  });
});

// ============================================================================
// ForwardToDeviceSchema Tests
// ============================================================================

describe("ForwardToDeviceSchema", () => {
  it("should validate correct message", () => {
    const message = {
      type: "forward.to_device",
      device_id: "device-123",
      payload: '{"type":"response","data":"test"}',
    };

    const result = ForwardToDeviceSchema.safeParse(message);
    expect(result.success).toBe(true);
  });

  it("should reject empty device_id", () => {
    const message = {
      type: "forward.to_device",
      device_id: "",
      payload: '{"type":"response"}',
    };

    const result = ForwardToDeviceSchema.safeParse(message);
    expect(result.success).toBe(false);
  });

  it("should accept any string as payload", () => {
    const message = {
      type: "forward.to_device",
      device_id: "device-123",
      payload: "any string content",
    };

    const result = ForwardToDeviceSchema.safeParse(message);
    expect(result.success).toBe(true);
  });
});

// ============================================================================
// IncomingMessageSchema Tests
// ============================================================================

describe("IncomingMessageSchema", () => {
  const allMessageTypes = [
    {
      type: "workstation.register",
      payload: {
        api_key: "12345678901234567890123456789012",
        name: "Test",
        auth_key: "1234567890123456",
      },
    },
    {
      type: "connect",
      payload: {
        tunnel_id: "t1",
        auth_key: "1234567890123456",
        device_id: "d1",
      },
    },
    { type: "ping", timestamp: 123 },
  ];

  it.each(allMessageTypes)("should parse $type message", (message) => {
    const result = IncomingMessageSchema.safeParse(message);
    expect(result.success).toBe(true);
  });

  it("should reject pong message (not in incoming union)", () => {
    const message = {
      type: "pong",
      timestamp: 123,
    };

    const result = IncomingMessageSchema.safeParse(message);
    expect(result.success).toBe(false);
  });
});
