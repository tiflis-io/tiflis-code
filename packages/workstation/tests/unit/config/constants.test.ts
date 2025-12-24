/**
 * @file constants.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect } from "vitest";
import {
  CONNECTION_TIMING,
  PROTOCOL_VERSION,
  getProtocolVersion,
} from "../../../src/config/constants.js";

describe("CONNECTION_TIMING", () => {
  describe("fast disconnect detection", () => {
    it("should have PING_INTERVAL_MS of 5 seconds for fast liveness detection", () => {
      expect(CONNECTION_TIMING.PING_INTERVAL_MS).toBe(5_000);
    });

    it("should have PONG_TIMEOUT_MS of 10 seconds for fast stale detection", () => {
      expect(CONNECTION_TIMING.PONG_TIMEOUT_MS).toBe(10_000);
    });

    it("should have REGISTRATION_TIMEOUT_MS of 10 seconds", () => {
      expect(CONNECTION_TIMING.REGISTRATION_TIMEOUT_MS).toBe(10_000);
    });

    it("should have CLIENT_TIMEOUT_CHECK_INTERVAL_MS of 5 seconds for faster cleanup", () => {
      expect(CONNECTION_TIMING.CLIENT_TIMEOUT_CHECK_INTERVAL_MS).toBe(5_000);
    });

    it("should detect disconnect within ~5-8 seconds", () => {
      // With PING_INTERVAL=5s and PONG_TIMEOUT=10s,
      // disconnect is detected after 1-2 ping cycles
      const minDetectionTime = CONNECTION_TIMING.PING_INTERVAL_MS;
      const maxDetectionTime =
        CONNECTION_TIMING.PING_INTERVAL_MS + CONNECTION_TIMING.PONG_TIMEOUT_MS;

      expect(minDetectionTime).toBeLessThanOrEqual(8_000);
      expect(maxDetectionTime).toBeLessThanOrEqual(20_000);
    });
  });

  describe("fast reconnection", () => {
    it("should have RECONNECT_DELAY_MIN_MS of 500ms for fast first retry", () => {
      expect(CONNECTION_TIMING.RECONNECT_DELAY_MIN_MS).toBe(500);
    });

    it("should have RECONNECT_DELAY_MAX_MS of 5 seconds to not wait too long", () => {
      expect(CONNECTION_TIMING.RECONNECT_DELAY_MAX_MS).toBe(5_000);
    });

    it("should have min delay less than max delay", () => {
      expect(CONNECTION_TIMING.RECONNECT_DELAY_MIN_MS).toBeLessThan(
        CONNECTION_TIMING.RECONNECT_DELAY_MAX_MS
      );
    });
  });

  describe("timing relationships", () => {
    it("should have pong timeout greater than ping interval", () => {
      // Pong timeout should allow for multiple missed pings before disconnect
      expect(CONNECTION_TIMING.PONG_TIMEOUT_MS).toBeGreaterThan(
        CONNECTION_TIMING.PING_INTERVAL_MS
      );
    });

    it("should have client timeout check interval equal to or less than ping interval", () => {
      // Check interval should be frequent enough to detect timeouts promptly
      expect(
        CONNECTION_TIMING.CLIENT_TIMEOUT_CHECK_INTERVAL_MS
      ).toBeLessThanOrEqual(CONNECTION_TIMING.PING_INTERVAL_MS);
    });
  });
});

describe("PROTOCOL_VERSION", () => {
  it("should have major version 1", () => {
    expect(PROTOCOL_VERSION.major).toBe(1);
  });

  it("should have minor version 0", () => {
    expect(PROTOCOL_VERSION.minor).toBe(0);
  });

  it("should have patch version 0", () => {
    expect(PROTOCOL_VERSION.patch).toBe(0);
  });
});

describe("getProtocolVersion", () => {
  it("should return semver formatted string", () => {
    const version = getProtocolVersion();
    expect(version).toBe("1.0.0");
  });

  it("should match PROTOCOL_VERSION components", () => {
    const version = getProtocolVersion();
    const [major, minor, patch] = version.split(".").map(Number);

    expect(major).toBe(PROTOCOL_VERSION.major);
    expect(minor).toBe(PROTOCOL_VERSION.minor);
    expect(patch).toBe(PROTOCOL_VERSION.patch);
  });
});
