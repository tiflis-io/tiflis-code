/**
 * @file workspace-discovery.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { FileSystemWorkspaceDiscovery } from "../../../src/infrastructure/workspace/workspace-discovery.js";

describe("FileSystemWorkspaceDiscovery", () => {
  let workspaceDiscovery: FileSystemWorkspaceDiscovery;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      child: vi.fn().mockReturnThis(),
    };

    workspaceDiscovery = new FileSystemWorkspaceDiscovery({
      workspacesRoot: "/tmp/workspaces",
      logger: mockLogger,
    });
  });

  describe("getDefaultBranch", () => {
    it("should return 'main' when .git directory does not exist", async () => {
      const nonGitDir = "/tmp/non-existent-dir-" + Date.now();

      const result = await workspaceDiscovery.getDefaultBranch(nonGitDir);

      expect(result).toBe("main");
    });

    it("should return 'main' when git command fails", async () => {
      const invalidGitDir = "/tmp/invalid-git-" + Date.now();

      const result = await workspaceDiscovery.getDefaultBranch(invalidGitDir);

      expect(result).toBe("main");
    });
  });

  describe("listWorktrees", () => {
    it("should return empty array when path is not a git repository", async () => {
      // listWorktrees requires workspace and project args
      const result = await workspaceDiscovery.listWorktrees(
        "nonexistent-workspace",
        "nonexistent-project"
      );

      expect(result).toEqual([]);
    });
  });
});
