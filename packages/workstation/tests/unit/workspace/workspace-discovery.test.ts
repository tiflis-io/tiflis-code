// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { WorkspaceDiscovery } from "../../../src/infrastructure/workspace/workspace-discovery";

describe("WorkspaceDiscovery", () => {
  let workspaceDiscovery: WorkspaceDiscovery;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    };
    workspaceDiscovery = new WorkspaceDiscovery(mockLogger);
  });

  describe("getDefaultBranch", () => {
    it("should return 'main' when .git directory does not exist", async () => {
      const nonGitDir = "/tmp/non-existent-dir";

      const result = await workspaceDiscovery.getDefaultBranch(nonGitDir);

      expect(result).toBe("main");
    });

    it("should return 'main' when git command fails", async () => {
      const invalidGitDir = "/tmp/invalid-git";
      vi.mock("child_process", () => ({
        execSync: vi.fn().mockImplementation(() => {
          throw new Error("git command failed");
        }),
      }));

      const result = await workspaceDiscovery.getDefaultBranch(invalidGitDir);

      expect(result).toBe("main");
    });

    it("should return actual branch when git command succeeds", async () => {
      const validGitDir = "/tmp/valid-git";
      vi.mock("child_process", () => ({
        execSync: vi.fn().mockReturnValue("main\n"),
      }));

      const result = await workspaceDiscovery.getDefaultBranch(validGitDir);

      expect(result).toBe("main");
    });
  });

  describe("listWorktrees", () => {
    it("should return empty array when git command fails", async () => {
      const invalidDir = "/tmp/invalid";

      const result = await workspaceDiscovery.listWorktrees(invalidDir);

      expect(result).toEqual([]);
    });

    it("should return worktrees when git command succeeds", async () => {
      const validDir = "/tmp/valid";
      vi.mock("child_process", () => ({
        execSync: vi
          .fn()
          .mockReturnValue("/path/to/worktree1\n/path/to/worktree2\n"),
      }));

      const result = await workspaceDiscovery.listWorktrees(validDir);

      expect(result).toEqual(["/path/to/worktree1", "/path/to/worktree2"]);
    });
  });
});
