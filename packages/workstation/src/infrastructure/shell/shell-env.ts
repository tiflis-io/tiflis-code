/**
 * @file shell-env.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 *
 * Utility to get the interactive login shell environment variables,
 * ensuring PATH and other user-configured variables are properly sourced.
 */

import { execSync } from "child_process";

/**
 * Cached shell environment after first retrieval.
 */
let cachedShellEnv: NodeJS.ProcessEnv | null = null;

/**
 * Gets the user's default shell from environment.
 */
function getDefaultShell(): string {
  return process.env.SHELL ?? "/bin/bash";
}

/**
 * Retrieves environment variables from an interactive login shell.
 *
 * This spawns a login shell (-l) that sources ~/.zprofile, ~/.zshrc, ~/.bash_profile, etc.
 * to get the complete user environment including PATH modifications.
 *
 * The result is cached for the lifetime of the process.
 *
 * @returns The shell environment merged with process.env
 */
export function getShellEnv(): NodeJS.ProcessEnv {
  if (cachedShellEnv) {
    return cachedShellEnv;
  }

  const shell = getDefaultShell();
  const isZsh = shell.includes("zsh");
  const isBash = shell.includes("bash");

  // Build command to get environment from interactive login shell
  // -l: login shell (sources profile files)
  // -i: interactive shell (sources rc files)
  // -c: execute command
  let envOutput: string;

  try {
    if (isZsh) {
      // For zsh: use -i -l to get both .zprofile and .zshrc
      // Use env -0 to handle variables with newlines (null-separated)
      envOutput = execSync(`${shell} -i -l -c 'env -0'`, {
        encoding: "utf-8",
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for large environments
        env: {
          ...process.env,
          // Prevent zsh from printing extra output
          PROMPT_EOL_MARK: "",
        },
        stdio: ["pipe", "pipe", "pipe"], // Capture stderr to ignore it
      });
    } else if (isBash) {
      // For bash: use --login -i
      envOutput = execSync(`${shell} --login -i -c 'env -0'`, {
        encoding: "utf-8",
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
    } else {
      // For other shells: try generic approach
      envOutput = execSync(`${shell} -l -c 'env -0'`, {
        encoding: "utf-8",
        timeout: 5000,
        maxBuffer: 10 * 1024 * 1024,
        stdio: ["pipe", "pipe", "pipe"],
      });
    }

    // Parse null-separated environment variables
    const shellEnv: NodeJS.ProcessEnv = {};

    for (const entry of envOutput.split("\0")) {
      if (!entry) continue;
      const eqIndex = entry.indexOf("=");
      if (eqIndex > 0) {
        const key = entry.slice(0, eqIndex);
        const value = entry.slice(eqIndex + 1);
        shellEnv[key] = value;
      }
    }

    // Merge with process.env, preferring shell env for PATH-like variables
    cachedShellEnv = {
      ...process.env,
      ...shellEnv,
    };

    return cachedShellEnv;
  } catch (error) {
    // If shell env retrieval fails, fall back to process.env
    // This ensures the app still works even if shell sourcing fails
    console.warn(
      "Failed to retrieve shell environment, using process.env:",
      error instanceof Error ? error.message : String(error)
    );
    cachedShellEnv = { ...process.env };
    return cachedShellEnv;
  }
}

/**
 * Clears the cached shell environment.
 * Useful for testing or if the environment needs to be refreshed.
 */
export function clearShellEnvCache(): void {
  cachedShellEnv = null;
}
