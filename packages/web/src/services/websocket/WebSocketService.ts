// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import type { Credentials, ConnectionState } from '@/types';
import type {
  ConnectMessage,
  AuthMessage,
  HeartbeatMessage,
  SyncMessage,
} from '@/types/protocol';
import { logger, devLog } from '@/utils/logger';

export interface WebSocketServiceCallbacks {
  onConnectionStateChange: (state: ConnectionState) => void;
  onMessage: (message: unknown) => void;
  onWorkstationOnline: () => void;
  onWorkstationOffline: () => void;
}

// Timing constants from PROTOCOL.md
const PING_INTERVAL = 5000; // 5 seconds
const PONG_TIMEOUT = 10000; // 10 seconds
const HEARTBEAT_INTERVAL = 10000; // 10 seconds
const HEARTBEAT_TIMEOUT = 5000; // 5 seconds
const RECONNECT_DELAY_MIN = 500; // 500ms
const RECONNECT_DELAY_MAX = 5000; // 5 seconds

class WebSocketServiceImpl {
  private ws: WebSocket | null = null;
  private credentials: Credentials | null = null;
  private callbacks: WebSocketServiceCallbacks | null = null;

  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  private reconnectAttempts = 0;
  private isConnecting = false;
  private isAuthenticated = false;
  private intentionalDisconnect = false;

  private pendingRequests = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timestamp: number }
  >();

  // Maximum pending requests to prevent memory leaks
  private static readonly MAX_PENDING_REQUESTS = 100;

  /**
   * Initialize the WebSocket service with callbacks
   */
  init(callbacks: WebSocketServiceCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Connect to the tunnel server
   */
  async connect(credentials: Credentials): Promise<void> {
    if (this.isConnecting || this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.credentials = credentials;
    this.intentionalDisconnect = false;
    this.isConnecting = true;

    this.callbacks?.onConnectionStateChange('connecting');

    try {
      await this.establishConnection();
    } catch (error) {
      this.isConnecting = false;
      this.callbacks?.onConnectionStateChange('error');
      throw error;
    }
  }

  /**
   * Disconnect from the tunnel server
   */
  disconnect(): void {
    this.intentionalDisconnect = true;
    this.cleanup();
    this.callbacks?.onConnectionStateChange('disconnected');
  }

  /**
   * Send a message and wait for response
   */
  async sendRequest<T, M extends { type: string; id: string } = { type: string; id: string }>(
    message: M
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      // Cleanup stale requests if we've hit the limit
      if (this.pendingRequests.size >= WebSocketServiceImpl.MAX_PENDING_REQUESTS) {
        this.cleanupStaleRequests();
      }

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(message.id);
        reject(new Error('Request timeout'));
      }, 30000);

      this.pendingRequests.set(message.id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value as T);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
        timestamp: Date.now(),
      });

      this.send(message);
    });
  }

  /**
   * Send a message without waiting for response
   */
  send(message: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN && this.isAuthenticated;
  }

  /**
   * Manually trigger reconnection
   */
  reconnect(): void {
    if (this.credentials && !this.isConnecting) {
      this.intentionalDisconnect = false;
      this.reconnectAttempts = 0;
      this.cleanup();
      this.connect(this.credentials).catch((error) => {
        logger.error('Manual reconnection failed:', error);
      });
    }
  }

  /**
   * Get current reconnection attempt count
   */
  getReconnectAttempts(): number {
    return this.reconnectAttempts;
  }

  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.credentials) {
        reject(new Error('No credentials'));
        return;
      }

      try {
        this.ws = new WebSocket(this.credentials.tunnelUrl);
      } catch (error) {
        reject(error);
        return;
      }

      const connectionTimeout = setTimeout(() => {
        this.ws?.close();
        reject(new Error('Connection timeout'));
      }, 30000);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        this.callbacks?.onConnectionStateChange('connected');
        this.sendConnectMessage();
      };

      this.ws.onclose = (event) => {
        clearTimeout(connectionTimeout);
        this.handleClose(event);
        if (!this.isAuthenticated) {
          reject(new Error('Connection closed before authentication'));
        }
      };

      this.ws.onerror = (event) => {
        clearTimeout(connectionTimeout);
        logger.error('WebSocket error:', event);
        this.callbacks?.onConnectionStateChange('error');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data as string);
          this.handleMessage(message, resolve, reject);
        } catch (error) {
          logger.error('Failed to parse message:', error);
        }
      };
    });
  }

  private sendConnectMessage(): void {
    if (!this.credentials) return;

    const message: ConnectMessage = {
      type: 'connect',
      payload: {
        tunnel_id: this.credentials.tunnelId,
        auth_key: this.credentials.authKey,
        device_id: this.credentials.deviceId,
        reconnect: this.reconnectAttempts > 0,
      },
    };

    this.send(message);
    this.callbacks?.onConnectionStateChange('authenticating');
  }

  private sendAuthMessage(): void {
    if (!this.credentials) return;

    const message: AuthMessage = {
      type: 'auth',
      payload: {
        auth_key: this.credentials.authKey,
        device_id: this.credentials.deviceId,
      },
    };

    this.send(message);
  }

  private handleMessage(
    message: { type: string; id?: string; payload?: unknown },
    connectResolve?: (value: void) => void,
    connectReject?: (error: Error) => void
  ): void {
    // Handle response to pending requests
    if (message.id && this.pendingRequests.has(message.id)) {
      const pending = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.type === 'error') {
        const error = message.payload as { code: string; message: string };
        pending?.reject(new Error(`${error.code}: ${error.message}`));
      } else {
        pending?.resolve(message);
      }
      return;
    }

    switch (message.type) {
      case 'connected':
        this.sendAuthMessage();
        break;

      case 'auth.success':
        this.isConnecting = false;
        this.isAuthenticated = true;
        this.reconnectAttempts = 0;
        this.callbacks?.onConnectionStateChange('authenticated');
        this.startHeartbeat();
        this.requestSync();
        // Forward auth.success to message handler for workstation info extraction
        this.callbacks?.onMessage(message);
        connectResolve?.();
        break;

      case 'auth.error': {
        this.isConnecting = false;
        this.callbacks?.onConnectionStateChange('error');
        const error = message.payload as { code: string; message: string };
        connectReject?.(new Error(`Auth failed: ${error.message}`));
        break;
      }

      case 'pong':
        this.handlePong();
        break;

      case 'heartbeat.ack':
        this.handleHeartbeatAck();
        break;

      case 'connection.workstation_online':
        this.callbacks?.onWorkstationOnline();
        break;

      case 'connection.workstation_offline':
        this.callbacks?.onWorkstationOffline();
        break;

      default:
        // Forward other messages to the callback
        this.callbacks?.onMessage(message);
    }
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    // Transport-level ping
    this.pingInterval = setInterval(() => {
      this.sendPing();
    }, PING_INTERVAL);

    // Application-level heartbeat
    this.heartbeatInterval = setInterval(() => {
      this.sendHeartbeat();
    }, HEARTBEAT_INTERVAL);

    // Send initial heartbeat
    this.sendHeartbeat();
  }

  private stopHeartbeat(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private sendPing(): void {
    this.send({ type: 'ping', timestamp: Date.now() });

    this.pongTimeout = setTimeout(() => {
      logger.warn('Pong timeout - connection may be stale');
      this.callbacks?.onConnectionStateChange('degraded');
    }, PONG_TIMEOUT);
  }

  private handlePong(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
  }

  private sendHeartbeat(): void {
    const message: HeartbeatMessage = {
      type: 'heartbeat',
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };

    this.send(message);

    this.heartbeatTimeout = setTimeout(() => {
      logger.warn('Heartbeat timeout - connection may be stale');
      this.callbacks?.onConnectionStateChange('degraded');
    }, HEARTBEAT_TIMEOUT);
  }

  private handleHeartbeatAck(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
    this.callbacks?.onConnectionStateChange('verified');
  }

  private requestSync(): void {
    const message: SyncMessage = {
      type: 'sync',
      id: crypto.randomUUID(),
    };

    this.send(message);
  }

  private handleClose(event: CloseEvent): void {
    this.cleanup();

    if (this.intentionalDisconnect) {
      this.callbacks?.onConnectionStateChange('disconnected');
      return;
    }

    devLog.ws('WebSocket closed:', event.code, event.reason);
    this.callbacks?.onConnectionStateChange('disconnected');

    // Attempt to reconnect
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.intentionalDisconnect || !this.credentials) {
      return;
    }

    const delay = Math.min(
      RECONNECT_DELAY_MIN * Math.pow(2, this.reconnectAttempts),
      RECONNECT_DELAY_MAX
    );

    this.reconnectAttempts++;
    devLog.ws(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      if (this.credentials && !this.intentionalDisconnect) {
        this.connect(this.credentials).catch((error) => {
          logger.error('Reconnection failed:', error);
        });
      }
    }, delay);
  }

  /**
   * Cleanup stale pending requests (older than 60 seconds)
   */
  private cleanupStaleRequests(): void {
    const now = Date.now();
    const staleThreshold = 60000; // 60 seconds

    for (const [id, pending] of this.pendingRequests) {
      if (now - pending.timestamp > staleThreshold) {
        pending.reject(new Error('Request expired'));
        this.pendingRequests.delete(id);
      }
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;

      if (
        this.ws.readyState === WebSocket.OPEN ||
        this.ws.readyState === WebSocket.CONNECTING
      ) {
        this.ws.close(1000, 'Client disconnect');
      }

      this.ws = null;
    }

    this.isConnecting = false;
    this.isAuthenticated = false;

    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      pending.reject(new Error('Connection closed'));
      this.pendingRequests.delete(id);
    }
  }
}

export const WebSocketService = new WebSocketServiceImpl();
