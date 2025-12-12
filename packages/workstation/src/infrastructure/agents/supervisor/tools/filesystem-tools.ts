/**
 * @file filesystem-tools.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * LangGraph tools for file system operations.
 */

import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { readdir, readFile, stat } from 'fs/promises';
import { join, resolve } from 'path';

/**
 * Creates file system tools.
 */
export function createFilesystemTools(workspacesRoot: string) {
  /**
   * Lists directory contents.
   */
  const listDirectory = tool(
    async ({ path, showHidden }: { path: string; showHidden?: boolean }) => {
      try {
        const resolvedPath = resolveSafePath(path, workspacesRoot);
        const entries = await readdir(resolvedPath, { withFileTypes: true });

        const filtered = showHidden
          ? entries
          : entries.filter((e) => !e.name.startsWith('.'));

        if (filtered.length === 0) {
          return `Directory "${path}" is empty.`;
        }

        const formatted = filtered.map((e) => {
          const prefix = e.isDirectory() ? '📁' : '📄';
          return `${prefix} ${e.name}`;
        });

        return `Contents of "${path}":\n${formatted.join('\n')}`;
      } catch (error) {
        return `Error listing directory: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'list_directory',
      description:
        'Lists the contents of a directory. Shows files and subdirectories.',
      schema: z.object({
        path: z.string().describe('Path to the directory (relative to workspaces root or absolute)'),
        showHidden: z.boolean().optional().describe('Whether to show hidden files (starting with .)'),
      }),
    }
  );

  /**
   * Reads file contents.
   */
  const readFileContent = tool(
    async ({ path, maxLines }: { path: string; maxLines?: number }) => {
      try {
        const resolvedPath = resolveSafePath(path, workspacesRoot);
        const fileStat = await stat(resolvedPath);

        // Limit file size to 100KB
        if (fileStat.size > 100 * 1024) {
          return `File is too large (${Math.round(fileStat.size / 1024)}KB). Maximum is 100KB.`;
        }

        const content = await readFile(resolvedPath, 'utf-8');
        const lines = content.split('\n');

        if (maxLines && lines.length > maxLines) {
          return `File: ${path} (showing first ${maxLines} of ${lines.length} lines)\n\n${lines.slice(0, maxLines).join('\n')}\n\n... (${lines.length - maxLines} more lines)`;
        }

        return `File: ${path}\n\n${content}`;
      } catch (error) {
        return `Error reading file: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'read_file',
      description:
        'Reads the contents of a file. Limited to 100KB files for safety.',
      schema: z.object({
        path: z.string().describe('Path to the file'),
        maxLines: z.number().optional().describe('Maximum number of lines to return'),
      }),
    }
  );

  /**
   * Gets file/directory info.
   */
  const getFileInfo = tool(
    async ({ path }: { path: string }) => {
      try {
        const resolvedPath = resolveSafePath(path, workspacesRoot);
        const fileStat = await stat(resolvedPath);

        const info = [
          `Path: ${path}`,
          `Type: ${fileStat.isDirectory() ? 'Directory' : 'File'}`,
          `Size: ${formatSize(fileStat.size)}`,
          `Modified: ${fileStat.mtime.toISOString()}`,
          `Created: ${fileStat.birthtime.toISOString()}`,
        ];

        return info.join('\n');
      } catch (error) {
        return `Error getting file info: ${error instanceof Error ? error.message : String(error)}`;
      }
    },
    {
      name: 'get_file_info',
      description: 'Gets information about a file or directory (size, modified date, etc.).',
      schema: z.object({
        path: z.string().describe('Path to the file or directory'),
      }),
    }
  );

  return [listDirectory, readFileContent, getFileInfo];
}

/**
 * Safely resolves a path within the workspaces root.
 */
function resolveSafePath(path: string, workspacesRoot: string): string {
  // If absolute path, use it directly (but validate it's not escaping)
  const resolved = path.startsWith('/') ? path : join(workspacesRoot, path);
  const normalized = resolve(resolved);

  // Security: ensure we're not escaping the workspaces root or home directory
  const homeDir = process.env.HOME ?? '/';
  if (!normalized.startsWith(workspacesRoot) && !normalized.startsWith(homeDir)) {
    throw new Error(`Access denied: Path must be within ${workspacesRoot} or home directory`);
  }

  return normalized;
}

/**
 * Formats file size in human-readable format.
 */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

