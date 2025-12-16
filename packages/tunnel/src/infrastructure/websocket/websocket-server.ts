/**
 * @file websocket-server.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { WebSocketServer as WSServer, type WebSocket } from 'ws';
import type { Server } from 'http';
import type { Logger } from 'pino';
import type { ConnectionHandler } from './connection-handler.js';

export interface WebSocketServerConfig {
  path: string;
  heartbeatIntervalMs: number;
  connectionTimeoutMs: number;
}

export interface WebSocketServerDeps {
  connectionHandler: ConnectionHandler;
  onTimeoutCheck?: () => void;
  logger: Logger;
}

/**
 * WebSocket server wrapper that integrates with the HTTP server
 * and manages the WebSocket lifecycle.
 */
export class WebSocketServerWrapper {
  private wss: WSServer | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private readonly config: WebSocketServerConfig;
  private readonly deps: WebSocketServerDeps;
  private readonly logger: Logger;

  constructor(config: WebSocketServerConfig, deps: WebSocketServerDeps) {
    this.config = config;
    this.deps = deps;
    this.logger = deps.logger.child({ component: 'WebSocketServer' });
  }

  /**
   * Attaches the WebSocket server to an HTTP server.
   */
  attach(httpServer: Server): void {
    this.wss = new WSServer({
      server: httpServer,
      path: this.config.path,
      maxPayload: 50 * 1024 * 1024, // 50MB - allow large messages for audio sync
    });

    this.wss.on('connection', (socket: WebSocket) => {
      this.logger.debug('New WebSocket connection');
      this.deps.connectionHandler.handleConnection(socket);
    });

    this.wss.on('error', (error) => {
      this.logger.error({ error }, 'WebSocket server error');
    });

    // Start heartbeat/timeout check interval
    this.startHeartbeatCheck();

    this.logger.info(
      { path: this.config.path },
      'WebSocket server attached'
    );
  }

  /**
   * Starts the periodic heartbeat/timeout check.
   */
  private startHeartbeatCheck(): void {
    this.heartbeatInterval = setInterval(() => {
      this.deps.onTimeoutCheck?.();
    }, this.config.heartbeatIntervalMs);
  }

  /**
   * Broadcasts a message to all connected clients.
   */
  broadcast(message: string | object): void {
    if (!this.wss) return;

    const data = typeof message === 'string' ? message : JSON.stringify(message);

    this.wss.clients.forEach((client) => {
      if (client.readyState === 1) {
        client.send(data);
      }
    });
  }

  /**
   * Returns the number of connected clients.
   */
  get connectionCount(): number {
    return this.wss?.clients.size ?? 0;
  }

  /**
   * Closes the WebSocket server gracefully with timeout.
   * @param timeoutMs - Maximum time to wait for graceful close (default: 5000ms)
   */
  async close(timeoutMs = 5000): Promise<void> {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    const wss = this.wss;
    if (!wss) return;

    const clientCount = wss.clients.size;
    this.logger.info({ clientCount }, 'Closing WebSocket server');

    // Send close frame to all clients
    wss.clients.forEach((client) => {
      try {
        client.close(1001, 'Server shutting down');
      } catch {
        // Ignore errors on close
      }
    });

    // Wait for graceful close with timeout
    const closePromise = new Promise<void>((resolve, reject) => {
      wss.close((err) => {
        if (err) {
          this.logger.error({ error: err }, 'Error closing WebSocket server');
          reject(err);
        } else {
          this.logger.info('WebSocket server closed gracefully');
          resolve();
        }
      });
    });

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        this.logger.warn(
          { timeoutMs, remainingClients: wss.clients.size },
          'WebSocket graceful close timed out, forcing termination'
        );

        // Force terminate all remaining connections
        wss.clients.forEach((client) => {
          try {
            client.terminate();
          } catch {
            // Ignore errors on terminate
          }
        });

        resolve();
      }, timeoutMs);
    });

    // Race between graceful close and timeout
    await Promise.race([closePromise, timeoutPromise]);
  }
}

