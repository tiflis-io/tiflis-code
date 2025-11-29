/**
 * @file opencode-daemon.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 *
 * Manager for the OpenCode daemon process.
 * OpenCode uses a daemon architecture where `opencode serve` runs persistently
 * and multiple `opencode run --attach` clients connect to it.
 */

import { spawn, type ChildProcess } from 'child_process';
import type { Logger } from 'pino';

/**
 * Configuration for OpenCode Daemon.
 */
export interface OpenCodeDaemonConfig {
  /** Port for the daemon to listen on */
  port?: number;
  /** Host to bind to */
  host?: string;
  /** Logger instance */
  logger: Logger;
}

/**
 * Daemon state.
 */
export type DaemonState = 'stopped' | 'starting' | 'running' | 'stopping' | 'error';

/**
 * Manager for the OpenCode daemon process.
 *
 * The OpenCode daemon (`opencode serve`) runs as a background process and accepts
 * connections from headless clients (`opencode run --attach`).
 */
export class OpenCodeDaemonManager {
  private readonly port: number;
  private readonly host: string;
  private readonly logger: Logger;
  private process: ChildProcess | null = null;
  private state: DaemonState = 'stopped';
  private restartAttempts = 0;
  private readonly maxRestartAttempts = 3;
  private healthCheckInterval: NodeJS.Timeout | null = null;

  constructor(config: OpenCodeDaemonConfig) {
    this.port = config.port ?? 4200;
    this.host = config.host ?? 'localhost';
    this.logger = config.logger.child({ component: 'OpenCodeDaemon' });
  }

  /**
   * Get the daemon URL for clients to connect to.
   */
  get daemonUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Get current daemon state.
   */
  getState(): DaemonState {
    return this.state;
  }

  /**
   * Check if daemon is running and healthy.
   */
  isRunning(): boolean {
    return this.state === 'running' && this.process !== null;
  }

  /**
   * Start the OpenCode daemon.
   */
  async start(): Promise<void> {
    if (this.state === 'running') {
      this.logger.debug('Daemon already running');
      return;
    }

    if (this.state === 'starting') {
      this.logger.debug('Daemon is already starting');
      return;
    }

    this.state = 'starting';
    this.logger.info({ port: this.port }, 'Starting OpenCode daemon');

    try {
      // Check if daemon is already running on the port
      const alreadyRunning = await this.checkHealth();
      if (alreadyRunning) {
        this.logger.info('OpenCode daemon already running on port');
        this.state = 'running';
        this.startHealthCheck();
        return;
      }

      // Spawn the daemon process
      this.process = spawn('opencode', ['serve', '--port', String(this.port)], {
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });

      // Handle process events
      this.process.on('error', (error) => {
        this.logger.error({ error }, 'Daemon process error');
        this.state = 'error';
        this.handleProcessExit();
      });

      this.process.on('exit', (code, signal) => {
        this.logger.warn({ code, signal }, 'Daemon process exited');
        this.state = 'stopped';
        this.handleProcessExit();
      });

      // Log stdout/stderr
      this.process.stdout?.on('data', (data: Buffer) => {
        this.logger.debug({ stdout: data.toString().trim() }, 'Daemon stdout');
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        this.logger.warn({ stderr: data.toString().trim() }, 'Daemon stderr');
      });

      // Wait for daemon to be ready
      await this.waitForReady();
      this.state = 'running';
      this.restartAttempts = 0;
      this.startHealthCheck();

      this.logger.info({ port: this.port, pid: this.process.pid }, 'OpenCode daemon started');
    } catch (error) {
      this.state = 'error';
      this.logger.error({ error }, 'Failed to start OpenCode daemon');
      throw error;
    }
  }

  /**
   * Stop the OpenCode daemon.
   */
  async stop(): Promise<void> {
    if (this.state === 'stopped') {
      return;
    }

    this.state = 'stopping';
    this.stopHealthCheck();

    if (this.process) {
      this.logger.info({ pid: this.process.pid }, 'Stopping OpenCode daemon');

      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          this.logger.warn('Daemon did not exit gracefully, force killing');
          this.process?.kill('SIGKILL');
          this.process = null;
          this.state = 'stopped';
          resolve();
        }, 5000);

        this.process?.once('exit', () => {
          clearTimeout(timeout);
          this.process = null;
          this.state = 'stopped';
          this.logger.info('OpenCode daemon stopped');
          resolve();
        });

        this.process?.kill('SIGTERM');
      });
    }

    this.state = 'stopped';
  }

  /**
   * Restart the daemon.
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  /**
   * Check daemon health via HTTP.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${this.daemonUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Wait for daemon to be ready.
   */
  private async waitForReady(maxWaitMs = 10000): Promise<void> {
    const startTime = Date.now();
    const pollIntervalMs = 200;

    while (Date.now() - startTime < maxWaitMs) {
      if (await this.checkHealth()) {
        return;
      }
      await this.delay(pollIntervalMs);
    }

    throw new Error(`Daemon did not become ready within ${maxWaitMs}ms`);
  }

  /**
   * Start periodic health checks.
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    this.healthCheckInterval = setInterval(() => {
      if (this.state !== 'running') return;

      void this.checkHealth().then((healthy) => {
        if (!healthy) {
          this.logger.warn('Daemon health check failed');
          this.handleProcessExit();
        }
      });
    }, 30000); // Check every 30 seconds
  }

  /**
   * Stop health checks.
   */
  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /**
   * Handle process exit - attempt restart if appropriate.
   */
  private handleProcessExit(): void {
    this.stopHealthCheck();
    this.process = null;

    if (this.state === 'stopping') {
      return; // Expected exit
    }

    if (this.restartAttempts < this.maxRestartAttempts) {
      this.restartAttempts++;
      this.logger.info(
        { attempt: this.restartAttempts, max: this.maxRestartAttempts },
        'Attempting to restart daemon'
      );

      // Delay before restart
      setTimeout(() => {
        this.start().catch((error: unknown) => {
          this.logger.error({ error }, 'Failed to restart daemon');
        });
      }, 2000 * this.restartAttempts); // Exponential backoff
    } else {
      this.logger.error('Max restart attempts reached, daemon will not be restarted');
      this.state = 'error';
    }
  }

  /**
   * Helper delay function.
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Cleanup on shutdown.
   */
  async cleanup(): Promise<void> {
    await this.stop();
  }
}

/**
 * Creates an OpenCode daemon manager from environment configuration.
 */
export function createOpenCodeDaemonManager(
  env: { OPENCODE_DAEMON_URL?: string },
  logger: Logger
): OpenCodeDaemonManager {
  let port = 4200;
  let host = 'localhost';

  if (env.OPENCODE_DAEMON_URL) {
    try {
      const url = new URL(env.OPENCODE_DAEMON_URL);
      host = url.hostname;
      port = parseInt(url.port, 10) || 4200;
    } catch {
      logger.warn({ url: env.OPENCODE_DAEMON_URL }, 'Invalid OPENCODE_DAEMON_URL, using defaults');
    }
  }

  return new OpenCodeDaemonManager({ port, host, logger });
}

