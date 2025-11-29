/**
 * @file client.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { WebSocket } from 'ws';
import type { DeviceId } from '../value-objects/device-id.js';
import type { SessionId } from '../value-objects/session-id.js';

/**
 * Client connection status.
 */
export type ClientStatus = 'connected' | 'authenticated' | 'disconnected';

/**
 * Properties for creating a client.
 */
export interface ClientProps {
  deviceId: DeviceId;
  socket?: WebSocket; // Optional for tunnel connections
}

/**
 * Entity representing a connected mobile client.
 */
export class Client {
  private readonly _deviceId: DeviceId;
  private _socket: WebSocket | undefined;
  private _status: ClientStatus;
  private readonly _connectedAt: Date;
  private _lastPingAt: Date;
  private readonly _subscriptions: Set<string>;
  private readonly _isTunnelConnection: boolean;

  constructor(props: ClientProps) {
    this._deviceId = props.deviceId;
    this._socket = props.socket;
    this._isTunnelConnection = props.socket === undefined;
    this._status = 'connected';
    this._connectedAt = new Date();
    this._lastPingAt = new Date();
    this._subscriptions = new Set();
  }

  get deviceId(): DeviceId {
    return this._deviceId;
  }

  get socket(): WebSocket | undefined {
    return this._socket;
  }

  get isTunnelConnection(): boolean {
    return this._isTunnelConnection;
  }

  get status(): ClientStatus {
    return this._status;
  }

  get connectedAt(): Date {
    return this._connectedAt;
  }

  get lastPingAt(): Date {
    return this._lastPingAt;
  }

  get subscriptions(): ReadonlySet<string> {
    return this._subscriptions;
  }

  get isAuthenticated(): boolean {
    return this._status === 'authenticated';
  }

  get isConnected(): boolean {
    return this._status !== 'disconnected';
  }

  /**
   * Marks the client as authenticated.
   */
  markAuthenticated(): void {
    this._status = 'authenticated';
  }

  /**
   * Marks the client as disconnected.
   */
  markDisconnected(): void {
    this._status = 'disconnected';
  }

  /**
   * Records a ping from the client.
   */
  recordPing(): void {
    this._lastPingAt = new Date();
  }

  /**
   * Updates the socket connection (for reconnection scenarios).
   * Only valid for direct WebSocket connections, not tunnel connections.
   */
  updateSocket(socket: WebSocket): void {
    if (this._isTunnelConnection) {
      throw new Error('Cannot update socket for tunnel connections');
    }
    this._socket = socket;
    this._lastPingAt = new Date();
  }

  /**
   * Subscribes the client to a session.
   */
  subscribe(sessionId: SessionId): boolean {
    if (this._subscriptions.has(sessionId.value)) {
      return false;
    }
    this._subscriptions.add(sessionId.value);
    return true;
  }

  /**
   * Unsubscribes the client from a session.
   */
  unsubscribe(sessionId: SessionId): boolean {
    return this._subscriptions.delete(sessionId.value);
  }

  /**
   * Checks if the client is subscribed to a session.
   */
  isSubscribedTo(sessionId: SessionId): boolean {
    return this._subscriptions.has(sessionId.value);
  }

  /**
   * Gets all subscribed session IDs.
   */
  getSubscriptions(): string[] {
    return Array.from(this._subscriptions);
  }

  /**
   * Restores subscriptions from a list of session IDs.
   */
  restoreSubscriptions(sessionIds: string[]): void {
    for (const id of sessionIds) {
      this._subscriptions.add(id);
    }
  }

  /**
   * Sends a message to the client.
   * For tunnel connections, this returns false (messages should be sent via broadcaster).
   */
  send(message: string): boolean {
    if (!this.isConnected) {
      return false;
    }
    if (this._isTunnelConnection || !this._socket) {
      // Tunnel connections should use broadcaster, not direct socket
      return false;
    }
    if (this._socket.readyState !== 1) {
      return false;
    }
    this._socket.send(message);
    return true;
  }

  /**
   * Checks if the client has timed out (no ping received within timeout period).
   */
  hasTimedOut(timeoutMs: number): boolean {
    const elapsed = Date.now() - this._lastPingAt.getTime();
    return elapsed > timeoutMs;
  }
}

