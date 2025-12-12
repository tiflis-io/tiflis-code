/**
 * @file workstation.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { WebSocket } from 'ws';
import type { TunnelId } from '../value-objects/tunnel-id.js';
import type { AuthKey } from '../value-objects/auth-key.js';

export type WorkstationStatus = 'online' | 'offline';

export interface WorkstationProps {
  tunnelId: TunnelId;
  name: string;
  authKey: AuthKey;
  socket: WebSocket;
  publicUrl: string;
}

/**
 * Entity representing a registered workstation.
 * A workstation is a user's machine running the workstation server.
 */
export class Workstation {
  private readonly _tunnelId: TunnelId;
  private readonly _name: string;
  private readonly _authKey: AuthKey;
  private _socket: WebSocket;
  private readonly _publicUrl: string;
  private _status: WorkstationStatus;
  private _lastPingAt: Date;
  private readonly _connectedAt: Date;

  constructor(props: WorkstationProps) {
    this._tunnelId = props.tunnelId;
    this._name = props.name;
    this._authKey = props.authKey;
    this._socket = props.socket;
    this._publicUrl = props.publicUrl;
    this._status = 'online';
    this._lastPingAt = new Date();
    this._connectedAt = new Date();
  }

  get tunnelId(): TunnelId {
    return this._tunnelId;
  }

  get name(): string {
    return this._name;
  }

  get authKey(): AuthKey {
    return this._authKey;
  }

  get socket(): WebSocket {
    return this._socket;
  }

  get publicUrl(): string {
    return this._publicUrl;
  }

  get status(): WorkstationStatus {
    return this._status;
  }

  get lastPingAt(): Date {
    return this._lastPingAt;
  }

  get connectedAt(): Date {
    return this._connectedAt;
  }

  get isOnline(): boolean {
    return this._status === 'online';
  }

  /**
   * Validates the provided auth key against this workstation's auth key.
   */
  validateAuthKey(authKey: AuthKey): boolean {
    return this._authKey.secureEquals(authKey);
  }

  /**
   * Updates the last ping timestamp.
   */
  recordPing(): void {
    this._lastPingAt = new Date();
    if (this._status === 'offline') {
      this._status = 'online';
    }
  }

  /**
   * Marks the workstation as offline.
   */
  markOffline(): void {
    this._status = 'offline';
  }

  /**
   * Marks the workstation as online.
   */
  markOnline(): void {
    this._status = 'online';
    this._lastPingAt = new Date();
  }

  /**
   * Updates the socket connection (for reconnection scenarios).
   */
  updateSocket(socket: WebSocket): void {
    this._socket = socket;
    this.markOnline();
  }

  /**
   * Sends a message to the workstation.
   */
  send(message: string): boolean {
    if (!this.isOnline || this._socket.readyState !== 1) {
      return false;
    }
    this._socket.send(message);
    return true;
  }

  /**
   * Checks if the workstation has timed out (no ping received within timeout period).
   */
  hasTimedOut(timeoutMs: number): boolean {
    const elapsed = Date.now() - this._lastPingAt.getTime();
    return elapsed > timeoutMs;
  }
}

