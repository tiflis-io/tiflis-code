/**
 * @file session-id.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect } from "vitest";
import { SessionId } from "../../../src/domain/value-objects/session-id.js";

describe("SessionId", () => {
  it("should create a valid session ID", () => {
    const id = new SessionId("test-session-id");
    expect(id.value).toBe("test-session-id");
  });

  it("should throw for empty session ID", () => {
    expect(() => new SessionId("")).toThrow(
      "Session ID must be at least 8 characters"
    );
  });

  it("should throw for short session ID", () => {
    expect(() => new SessionId("short")).toThrow(
      "Session ID must be at least 8 characters"
    );
  });

  it("should compare equal session IDs", () => {
    const id1 = new SessionId("test-session-id");
    const id2 = new SessionId("test-session-id");
    expect(id1.equals(id2)).toBe(true);
  });

  it("should compare different session IDs", () => {
    const id1 = new SessionId("test-session-1");
    const id2 = new SessionId("test-session-2");
    expect(id1.equals(id2)).toBe(false);
  });

  it("should convert to string", () => {
    const id = new SessionId("test-session-id");
    expect(id.toString()).toBe("test-session-id");
  });
});
