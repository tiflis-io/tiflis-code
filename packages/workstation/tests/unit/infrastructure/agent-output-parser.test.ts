/**
 * @file agent-output-parser.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect } from "vitest";
import { AgentOutputParser } from "../../../src/infrastructure/agents/agent-output-parser.js";

describe("AgentOutputParser", () => {
  const parser = new AgentOutputParser();

  describe("parseLine", () => {
    it("should parse an assistant message with message.content array", () => {
      const line = JSON.stringify({
        type: "assistant",
        message: {
          content: [{ type: "text", text: "Hello, world!" }],
        },
      });

      const result = parser.parseLine(line);

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]?.block_type).toBe("text");
      expect(result.blocks[0]?.content).toBe("Hello, world!");
      expect(result.isComplete).toBe(false);
    });

    it("should extract session_id from result message", () => {
      const line = JSON.stringify({
        type: "result",
        session_id: "sess-123",
      });

      const result = parser.parseLine(line);

      expect(result.sessionId).toBe("sess-123");
      expect(result.isComplete).toBe(true);
    });

    it("should parse a tool message", () => {
      const line = JSON.stringify({
        type: "tool",
        tool_name: "file_read",
        input: { path: "/test.txt" },
      });

      const result = parser.parseLine(line);

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]?.block_type).toBe("tool");
      expect(result.blocks[0]?.content).toBe("file_read");
    });

    it("should return empty blocks for invalid JSON", () => {
      const result = parser.parseLine("not valid json");

      expect(result.blocks).toHaveLength(0);
      expect(result.sessionId).toBeNull();
      expect(result.isComplete).toBe(false);
    });

    it("should return empty blocks for empty line", () => {
      const result = parser.parseLine("");

      expect(result.blocks).toHaveLength(0);
      expect(result.isComplete).toBe(false);
    });
  });

  describe("parseBuffer", () => {
    it("should parse multiple complete lines", () => {
      const buffer = [
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "Line 1" }] },
        }),
        JSON.stringify({
          type: "assistant",
          message: { content: [{ type: "text", text: "Line 2" }] },
        }),
        "",
      ].join("\n");

      const { results, remaining } = parser.parseBuffer(buffer);

      expect(results).toHaveLength(2);
      expect(remaining).toBe("");
      expect(results[0]?.blocks[0]?.content).toBe("Line 1");
      expect(results[1]?.blocks[0]?.content).toBe("Line 2");
    });

    it("should handle incomplete JSON lines", () => {
      const buffer = '{"type":"assistant","mes';
      const { results, remaining } = parser.parseBuffer(buffer);

      expect(results).toHaveLength(0);
      expect(remaining).toBe('{"type":"assistant","mes');
    });

    it("should handle mixed complete and incomplete lines", () => {
      const completeLine = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Complete" }] },
      });
      const buffer = `${completeLine}\n{"type":"ass`;

      const { results, remaining } = parser.parseBuffer(buffer);

      expect(results).toHaveLength(1);
      expect(remaining).toBe('{"type":"ass');
      expect(results[0]?.blocks[0]?.content).toBe("Complete");
    });

    it("should detect session_end as completion", () => {
      const buffer = '{"type":"session_end"}\n';
      const { results, remaining } = parser.parseBuffer(buffer);

      expect(results).toHaveLength(1);
      expect(remaining).toBe("");
      expect(results[0]?.isComplete).toBe(true);
    });

    it("should skip invalid JSON lines and continue", () => {
      const validLine = JSON.stringify({
        type: "assistant",
        message: { content: [{ type: "text", text: "Valid" }] },
      });
      const buffer = `not json\n${validLine}\n`;

      const { results, remaining } = parser.parseBuffer(buffer);

      // Invalid lines are skipped, only valid ones are returned
      expect(results).toHaveLength(1);
      expect(results[0]?.blocks[0]?.content).toBe("Valid");
    });

    it("should handle empty buffer", () => {
      const { results, remaining } = parser.parseBuffer("");

      expect(results).toHaveLength(0);
      expect(remaining).toBe("");
    });
  });
});
