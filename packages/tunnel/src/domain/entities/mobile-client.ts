/**
 * @file mobile-client.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { WebSocket } from 'ws';
import type { TunnelId } from '../value-objects/tunnel-id.js';

export type ClientStatus = 'connecting' | 'connected' | 'disconnected';

export interface MobileClientProps {
  deviceId: string;
  tunnelId: TunnelId;
  socket: WebSocket;
}

/**
 * Entity representing a connected mobile client (iOS/watchOS).
 * A mobile client connects to a workstation through the tunnel.
 */
export class MobileClient {
  private readonly _deviceId: string;
  private readonly _tunnelId: TunnelId;
  private _socket: WebSocket;
  private _status: ClientStatus;
  private _lastPingAt: Date;
  private readonly _connectedAt: Date;

  constructor(props: MobileClientProps) {
    this._deviceId = props.deviceId;
    this._tunnelId = props.tunnelId;
    this._socket = props.socket;
    this._status = 'connected';
    this._lastPingAt = new Date();
    this._connectedAt = new Date();
  }

  get deviceId(): string {
    return this._deviceId;
  }

  get tunnelId(): TunnelId {
    return this._tunnelId;
  }

  get socket(): WebSocket {
    return this._socket;
  }

  get status(): ClientStatus {
    return this._status;
  }

  get lastPingAt(): Date {
    return this._lastPingAt;
  }

  get connectedAt(): Date {
    return this._connectedAt;
  }

  get isConnected(): boolean {
    return this._status === 'connected';
  }

  /**
   * Updates the last ping timestamp.
   */
  recordPing(): void {
    this._lastPingAt = new Date();
  }

  /**
   * Marks the client as disconnected.
   */
  markDisconnected(): void {
    this._status = 'disconnected';
  }

  /**
   * Updates the socket connection (for reconnection scenarios).
   */
  updateSocket(socket: WebSocket): void {
    this._socket = socket;
    this._status = 'connected';
    this._lastPingAt = new Date();
  }

  /**
   * Sends a message to the client.
   * Returns false if send fails (socket error, not connected, etc.).
   */
  send(message: string): boolean {
    if (!this.isConnected || this._socket.readyState !== 1) {
      return false;
    }
    try {
      this._socket.send(message);
      return true;
    } catch (error) {
      // Socket.send() can throw if:
      // - Buffer is full (backpressure)
      // - Connection is lost between readyState check and send
      // - Memory allocation fails
      // Return false to allow caller to handle retry/buffering
      return false;
    }
  }

  /**
   * Checks if the client has timed out (no ping received within timeout period).
   */
  hasTimedOut(timeoutMs: number): boolean {
    const elapsed = Date.now() - this._lastPingAt.getTime();
    return elapsed > timeoutMs;
  }
}

