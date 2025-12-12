/**
 * @file tunnel-client.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import WebSocket from 'ws';
import type { Logger } from 'pino';
import { CONNECTION_TIMING } from '../../config/constants.js';
import type {
  WorkstationRegisterMessage,
  WorkstationRegisteredMessage,
  PingMessage,
  OutgoingTunnelMessage,
} from '../../protocol/messages.js';
import { parseTunnelMessage } from '../../protocol/schemas.js';
import type { WorkstationMetadataRepository } from '../persistence/repositories/workstation-metadata-repository.js';

export interface TunnelClientConfig {
  tunnelUrl: string;
  apiKey: string;
  workstationName: string;
  authKey: string;
  logger: Logger;
  metadataRepository: WorkstationMetadataRepository;
}

export interface TunnelClientCallbacks {
  onConnected: (tunnelId: string, publicUrl: string) => void;
  onDisconnected: () => void;
  onError: (error: Error) => void;
  onClientMessage: (message: string) => void;
  onClientDisconnected?: (deviceId: string) => void;
}

type TunnelState = 'disconnected' | 'connecting' | 'connected' | 'registered';

/**
 * WebSocket client for connecting to the tunnel server.
 */
export class TunnelClient {
  private readonly config: TunnelClientConfig;
  private readonly callbacks: TunnelClientCallbacks;
  private readonly logger: Logger;
  private readonly metadataRepository: WorkstationMetadataRepository;

  private ws: WebSocket | null = null;
  private state: TunnelState = 'disconnected';
  private tunnelId: string | null = null;
  private publicUrl: string | null = null;
  private reconnectAttempts = 0;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private registrationTimeout: NodeJS.Timeout | null = null;
  private messageBuffer: string[] = [];

  constructor(config: TunnelClientConfig, callbacks: TunnelClientCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.logger = config.logger.child({ component: 'tunnel-client' });
    this.metadataRepository = config.metadataRepository;

    // Load persisted tunnel ID from database
    const persistedTunnelId = this.metadataRepository.getTunnelId();
    const persistedPublicUrl = this.metadataRepository.getPublicUrl();
    if (persistedTunnelId) {
      this.tunnelId = persistedTunnelId;
      this.publicUrl = persistedPublicUrl;
      this.logger.info(
        { tunnelId: persistedTunnelId },
        'Loaded persisted tunnel ID from database'
      );
    }
  }

  /**
   * Gets the current connection state.
   */
  get connectionState(): TunnelState {
    return this.state;
  }

  /**
   * Checks if connected and registered with the tunnel.
   */
  get isConnected(): boolean {
    return this.state === 'registered';
  }

  /**
   * Gets the tunnel ID (available after registration).
   */
  getTunnelId(): string | null {
    return this.tunnelId;
  }

  /**
   * Gets the public URL (available after registration).
   */
  getPublicUrl(): string | null {
    return this.publicUrl;
  }

  /**
   * Connects to the tunnel server.
   */
  async connect(): Promise<void> {
    if (this.state !== 'disconnected') {
      this.logger.warn({ state: this.state }, 'Already connecting or connected');
      return;
    }

    this.state = 'connecting';
    this.logger.info({ url: this.config.tunnelUrl }, 'Connecting to tunnel');

    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.config.tunnelUrl);

        this.ws.on('open', () => {
          this.state = 'connected';
          this.reconnectAttempts = 0;
          this.logger.info('Connected to tunnel, registering...');
          this.sendRegistration();
          resolve();
        });

        this.ws.on('message', (data: Buffer) => {
          this.handleMessage(data.toString());
        });

        this.ws.on('close', (code, reason) => {
          this.logger.warn(
            { code, reason: reason.toString() },
            'Tunnel connection closed'
          );
          this.handleDisconnection();
        });

        this.ws.on('error', (error: Error) => {
          this.logger.error({ error }, 'Tunnel connection error');
          if (this.state === 'connecting') {
            reject(error);
          }
          this.callbacks.onError(error);
        });
      } catch (err) {
        this.state = 'disconnected';
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  }

  /**
   * Disconnects from the tunnel server.
   * Note: We don't clear tunnel_id from database on disconnect,
   * as it should persist for reconnection.
   */
  disconnect(): void {
    this.clearTimers();
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state = 'disconnected';
    // Keep tunnelId and publicUrl in memory for reconnection
    // They remain in database for persistence
    this.messageBuffer = [];
  }

  /**
   * Sends a message to the tunnel (for forwarding to clients).
   * Detects send failures and triggers reconnection.
   */
  send(message: string): boolean {
    if (this.state !== 'registered' || !this.ws) {
      // Buffer messages during reconnection
      if (this.state === 'connecting' || this.state === 'connected') {
        this.messageBuffer.push(message);
        return true;
      }
      return false;
    }

    // Check socket state before sending
    if (this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn(
        { readyState: this.ws.readyState },
        'Socket not open, triggering reconnection'
      );
      this.handleSendFailure();
      return false;
    }

    // Send with error callback to detect failures
    this.ws.send(message, (error) => {
      if (error) {
        this.logger.error({ error }, 'Send failed, triggering reconnection');
        this.handleSendFailure();
      }
    });
    return true;
  }

  /**
   * Handles send failure by disconnecting and scheduling reconnection.
   */
  private handleSendFailure(): void {
    // Only handle if we think we're connected
    if (this.state === 'disconnected') {
      return;
    }

    this.clearTimers();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Send failure');
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.state = 'disconnected';
    this.callbacks.onDisconnected();
    this.scheduleReconnect();
  }

  /**
   * Sends session output to subscribed clients via tunnel.
   * @deprecated Use sendToDevice for targeted delivery instead.
   */
  sendSessionOutput(sessionId: string, message: string): boolean {
    // Wrap the message in a forward envelope for the tunnel
    const forwardMessage = {
      type: 'forward.session_output',
      session_id: sessionId,
      payload: message,
    };
    return this.send(JSON.stringify(forwardMessage));
  }

  /**
   * Sends a message to a specific device via tunnel.
   * Used for targeted delivery (e.g., session output to subscribed clients only).
   */
  sendToDevice(deviceId: string, message: string): boolean {
    const forwardMessage = {
      type: 'forward.to_device',
      device_id: deviceId,
      payload: message,
    };
    return this.send(JSON.stringify(forwardMessage));
  }

  /**
   * Sends registration message to the tunnel.
   * Starts a timeout that will trigger reconnection if registration response is not received.
   */
  private sendRegistration(): void {
    const message: WorkstationRegisterMessage = {
      type: 'workstation.register',
      payload: {
        api_key: this.config.apiKey,
        name: this.config.workstationName,
        auth_key: this.config.authKey,
        reconnect: this.tunnelId !== null,
        previous_tunnel_id: this.tunnelId ?? undefined,
      },
    };

    this.sendToTunnel(message);

    // Start registration timeout - if we don't receive workstation.registered in time,
    // disconnect and retry to avoid being stuck in 'connected' state forever
    this.clearRegistrationTimeout();
    this.registrationTimeout = setTimeout(() => {
      if (this.state === 'connected') {
        this.logger.warn(
          { timeoutMs: CONNECTION_TIMING.REGISTRATION_TIMEOUT_MS },
          'Registration timeout - did not receive workstation.registered response'
        );
        this.handleRegistrationTimeout();
      }
    }, CONNECTION_TIMING.REGISTRATION_TIMEOUT_MS);
  }

  /**
   * Handles registration timeout.
   * Disconnects and schedules reconnection.
   */
  private handleRegistrationTimeout(): void {
    this.clearTimers();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Registration timeout');
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.state = 'disconnected';
    this.callbacks.onError(new Error('Registration timeout'));
    this.scheduleReconnect();
  }

  /**
   * Clears registration timeout.
   */
  private clearRegistrationTimeout(): void {
    if (this.registrationTimeout) {
      clearTimeout(this.registrationTimeout);
      this.registrationTimeout = null;
    }
  }

  /**
   * Sends a message to the tunnel.
   * Detects send failures and triggers reconnection.
   */
  private sendToTunnel(message: OutgoingTunnelMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.logger.warn('Cannot send to tunnel - socket not open');
      return;
    }
    this.ws.send(JSON.stringify(message), (error) => {
      if (error) {
        this.logger.error({ error, messageType: message.type }, 'Failed to send to tunnel');
        this.handleSendFailure();
      }
    });
  }

  /**
   * Handles incoming messages from the tunnel.
   */
  private handleMessage(raw: string): void {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      this.logger.warn({ raw }, 'Failed to parse tunnel message');
      return;
    }

    const message = parseTunnelMessage(data);
    if (!message) {
      // This might be a forwarded message from a client
      this.callbacks.onClientMessage(raw);
      return;
    }

    switch (message.type) {
      case 'workstation.registered':
        this.handleRegistered(message);
        break;

      case 'pong':
        // Heartbeat response, nothing to do
        this.logger.trace({ timestamp: message.timestamp }, 'Received pong');
        break;

      case 'error':
        this.logger.error({ payload: message.payload }, 'Tunnel error');
        this.callbacks.onError(new Error(message.payload.message));
        break;

      case 'client.disconnected':
        this.logger.info(
          { deviceId: message.payload.device_id, tunnelId: message.payload.tunnel_id },
          'Client disconnected notification received'
        );
        this.callbacks.onClientDisconnected?.(message.payload.device_id);
        break;
    }
  }

  /**
   * Handles successful registration.
   */
  private handleRegistered(message: WorkstationRegisteredMessage): void {
    // Clear registration timeout - we received the response
    this.clearRegistrationTimeout();

    this.tunnelId = message.payload.tunnel_id;
    this.publicUrl = message.payload.public_url;
    this.state = 'registered';

    // Persist tunnel ID and public URL to database
    this.metadataRepository.updateTunnelInfo(this.tunnelId, this.publicUrl);

    this.logger.info(
      {
        tunnelId: this.tunnelId,
        publicUrl: this.publicUrl,
        restored: message.payload.restored,
      },
      'Registered with tunnel'
    );

    // Start heartbeat
    this.startPingInterval();

    // Flush message buffer
    this.flushMessageBuffer();

    // Notify callback
    this.callbacks.onConnected(this.tunnelId, this.publicUrl);
  }

  /**
   * Handles disconnection and schedules reconnection.
   */
  private handleDisconnection(): void {
    this.clearTimers();
    this.state = 'disconnected';
    this.ws = null;

    this.callbacks.onDisconnected();
    this.scheduleReconnect();
  }

  /**
   * Starts the ping interval for heartbeat.
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      if (this.state === 'registered' && this.ws) {
        const ping: PingMessage = {
          type: 'ping',
          timestamp: Date.now(),
        };
        this.sendToTunnel(ping);
      }
    }, CONNECTION_TIMING.PING_INTERVAL_MS);
  }

  /**
   * Schedules a reconnection attempt.
   */
  private scheduleReconnect(): void {
    const delay = Math.min(
      CONNECTION_TIMING.RECONNECT_DELAY_MIN_MS * Math.pow(2, this.reconnectAttempts),
      CONNECTION_TIMING.RECONNECT_DELAY_MAX_MS
    );

    this.logger.info(
      { delay, attempt: this.reconnectAttempts + 1 },
      'Scheduling reconnect'
    );

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.connect().catch((error: unknown) => {
        this.logger.error({ error }, 'Reconnection failed');
        this.scheduleReconnect();
      });
    }, delay);
  }

  /**
   * Flushes buffered messages after reconnection.
   */
  private flushMessageBuffer(): void {
    const buffer = this.messageBuffer;
    this.messageBuffer = [];

    for (const message of buffer) {
      this.send(message);
    }

    if (buffer.length > 0) {
      this.logger.debug({ count: buffer.length }, 'Flushed message buffer');
    }
  }

  /**
   * Clears all timers.
   */
  private clearTimers(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.clearRegistrationTimeout();
  }
}

