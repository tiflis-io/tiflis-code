/**
 * @file errors.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect } from "vitest";
import {
  createErrorMessage,
  ProtocolErrors,
} from "../../../src/protocol/errors.js";

// ============================================================================
// createErrorMessage Tests
// ============================================================================

describe("createErrorMessage", () => {
  it("should create basic error message with code and message", () => {
    const error = createErrorMessage("INVALID_API_KEY", "Invalid API key");

    expect(error.type).toBe("error");
    expect(error.payload.code).toBe("INVALID_API_KEY");
    expect(error.payload.message).toBe("Invalid API key");
    expect(error.id).toBeUndefined();
    expect(error.payload.details).toBeUndefined();
  });

  it("should include request ID when provided", () => {
    const error = createErrorMessage(
      "INVALID_AUTH_KEY",
      "Invalid auth key",
      "request-123"
    );

    expect(error.id).toBe("request-123");
  });

  it("should include details when provided", () => {
    const details = { field: "auth_key", reason: "too short" };
    const error = createErrorMessage(
      "INVALID_PAYLOAD",
      "Validation failed",
      undefined,
      details
    );

    expect(error.payload.details).toEqual(details);
  });

  it("should include both request ID and details", () => {
    const details = { expected: 32, actual: 10 };
    const error = createErrorMessage(
      "INVALID_API_KEY",
      "API key too short",
      "req-456",
      details
    );

    expect(error.id).toBe("req-456");
    expect(error.payload.details).toEqual(details);
  });

  it("should handle null details (not undefined)", () => {
    const error = createErrorMessage(
      "INTERNAL_ERROR",
      "Something went wrong",
      "req-789",
      null
    );

    expect(error.payload.details).toBeNull();
  });

  it("should handle empty string details", () => {
    const error = createErrorMessage(
      "INTERNAL_ERROR",
      "Error",
      undefined,
      ""
    );

    expect(error.payload.details).toBe("");
  });

  it("should handle array details", () => {
    const details = ["error1", "error2", "error3"];
    const error = createErrorMessage(
      "INVALID_PAYLOAD",
      "Multiple errors",
      undefined,
      details
    );

    expect(error.payload.details).toEqual(details);
  });
});

// ============================================================================
// ProtocolErrors Factory Tests
// ============================================================================

describe("ProtocolErrors", () => {
  describe("invalidApiKey", () => {
    it("should create INVALID_API_KEY error without request ID", () => {
      const error = ProtocolErrors.invalidApiKey();

      expect(error.type).toBe("error");
      expect(error.payload.code).toBe("INVALID_API_KEY");
      expect(error.payload.message).toContain("Invalid API key");
      expect(error.id).toBeUndefined();
    });

    it("should create INVALID_API_KEY error with request ID", () => {
      const error = ProtocolErrors.invalidApiKey("req-123");

      expect(error.id).toBe("req-123");
      expect(error.payload.code).toBe("INVALID_API_KEY");
    });
  });

  describe("invalidAuthKey", () => {
    it("should create INVALID_AUTH_KEY error without request ID", () => {
      const error = ProtocolErrors.invalidAuthKey();

      expect(error.payload.code).toBe("INVALID_AUTH_KEY");
      expect(error.payload.message).toContain("Invalid authentication key");
    });

    it("should create INVALID_AUTH_KEY error with request ID", () => {
      const error = ProtocolErrors.invalidAuthKey("req-456");

      expect(error.id).toBe("req-456");
    });
  });

  describe("tunnelNotFound", () => {
    it("should create TUNNEL_NOT_FOUND error with tunnel ID", () => {
      const error = ProtocolErrors.tunnelNotFound("tunnel-abc123");

      expect(error.payload.code).toBe("TUNNEL_NOT_FOUND");
      expect(error.payload.message).toContain("tunnel-abc123");
    });

    it("should create TUNNEL_NOT_FOUND error with tunnel ID and request ID", () => {
      const error = ProtocolErrors.tunnelNotFound("tunnel-xyz", "req-789");

      expect(error.id).toBe("req-789");
      expect(error.payload.message).toContain("tunnel-xyz");
    });
  });

  describe("workstationOffline", () => {
    it("should create WORKSTATION_OFFLINE error with tunnel ID", () => {
      const error = ProtocolErrors.workstationOffline("tunnel-123");

      expect(error.payload.code).toBe("WORKSTATION_OFFLINE");
      expect(error.payload.message).toContain("tunnel-123");
      expect(error.payload.message).toContain("offline");
    });

    it("should create WORKSTATION_OFFLINE error with tunnel ID and request ID", () => {
      const error = ProtocolErrors.workstationOffline("tunnel-456", "req-001");

      expect(error.id).toBe("req-001");
    });
  });

  describe("registrationFailed", () => {
    it("should create REGISTRATION_FAILED error with reason", () => {
      const error = ProtocolErrors.registrationFailed("API key expired");

      expect(error.payload.code).toBe("REGISTRATION_FAILED");
      expect(error.payload.message).toContain("API key expired");
    });

    it("should create REGISTRATION_FAILED error with reason and request ID", () => {
      const error = ProtocolErrors.registrationFailed(
        "Duplicate registration",
        "req-002"
      );

      expect(error.id).toBe("req-002");
      expect(error.payload.message).toContain("Duplicate registration");
    });
  });

  describe("invalidPayload", () => {
    it("should create INVALID_PAYLOAD error with message", () => {
      const error = ProtocolErrors.invalidPayload("Missing required field");

      expect(error.payload.code).toBe("INVALID_PAYLOAD");
      expect(error.payload.message).toBe("Missing required field");
    });

    it("should create INVALID_PAYLOAD error with message and request ID", () => {
      const error = ProtocolErrors.invalidPayload(
        "Invalid format",
        "req-003"
      );

      expect(error.id).toBe("req-003");
    });

    it("should create INVALID_PAYLOAD error with details", () => {
      const details = { field: "timestamp", error: "must be a number" };
      const error = ProtocolErrors.invalidPayload(
        "Validation failed",
        "req-004",
        details
      );

      expect(error.payload.details).toEqual(details);
    });
  });

  describe("internalError", () => {
    it("should create INTERNAL_ERROR with default message", () => {
      const error = ProtocolErrors.internalError();

      expect(error.payload.code).toBe("INTERNAL_ERROR");
      expect(error.payload.message).toBe("An internal error occurred");
    });

    it("should create INTERNAL_ERROR with custom message", () => {
      const error = ProtocolErrors.internalError("Database connection failed");

      expect(error.payload.message).toBe("Database connection failed");
    });

    it("should create INTERNAL_ERROR with request ID", () => {
      const error = ProtocolErrors.internalError(undefined, "req-005");

      expect(error.id).toBe("req-005");
      expect(error.payload.message).toBe("An internal error occurred");
    });

    it("should create INTERNAL_ERROR with custom message and request ID", () => {
      const error = ProtocolErrors.internalError("Timeout exceeded", "req-006");

      expect(error.id).toBe("req-006");
      expect(error.payload.message).toBe("Timeout exceeded");
    });
  });
});

// ============================================================================
// Error Message Structure Tests
// ============================================================================

describe("Error Message Structure", () => {
  it("should always have type 'error'", () => {
    const errors = [
      ProtocolErrors.invalidApiKey(),
      ProtocolErrors.invalidAuthKey(),
      ProtocolErrors.tunnelNotFound("t1"),
      ProtocolErrors.workstationOffline("t1"),
      ProtocolErrors.registrationFailed("reason"),
      ProtocolErrors.invalidPayload("message"),
      ProtocolErrors.internalError(),
    ];

    for (const error of errors) {
      expect(error.type).toBe("error");
    }
  });

  it("should always have payload with code and message", () => {
    const errors = [
      ProtocolErrors.invalidApiKey(),
      ProtocolErrors.invalidAuthKey(),
      ProtocolErrors.tunnelNotFound("t1"),
      ProtocolErrors.workstationOffline("t1"),
      ProtocolErrors.registrationFailed("reason"),
      ProtocolErrors.invalidPayload("message"),
      ProtocolErrors.internalError(),
    ];

    for (const error of errors) {
      expect(error.payload).toBeDefined();
      expect(error.payload.code).toBeDefined();
      expect(error.payload.message).toBeDefined();
      expect(typeof error.payload.code).toBe("string");
      expect(typeof error.payload.message).toBe("string");
    }
  });

  it("should use correct error codes for each factory", () => {
    expect(ProtocolErrors.invalidApiKey().payload.code).toBe("INVALID_API_KEY");
    expect(ProtocolErrors.invalidAuthKey().payload.code).toBe("INVALID_AUTH_KEY");
    expect(ProtocolErrors.tunnelNotFound("t").payload.code).toBe("TUNNEL_NOT_FOUND");
    expect(ProtocolErrors.workstationOffline("t").payload.code).toBe("WORKSTATION_OFFLINE");
    expect(ProtocolErrors.registrationFailed("r").payload.code).toBe("REGISTRATION_FAILED");
    expect(ProtocolErrors.invalidPayload("m").payload.code).toBe("INVALID_PAYLOAD");
    expect(ProtocolErrors.internalError().payload.code).toBe("INTERNAL_ERROR");
  });
});
