/**
 * @file http-client.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import type { TunnelId } from '../value-objects/tunnel-id.js';

export type HttpClientStatus = 'active' | 'inactive';

export interface HttpClientProps {
  deviceId: string;
  tunnelId: TunnelId;
}

export interface QueuedMessage {
  sequence: number;
  timestamp: Date;
  data: string;
}

/**
 * Entity representing an HTTP polling client (watchOS).
 * Unlike WebSocket clients, HTTP clients poll for messages.
 * Messages are queued and delivered on poll requests.
 */
export class HttpClient {
  private readonly _deviceId: string;
  private readonly _tunnelId: TunnelId;
  private _status: HttpClientStatus;
  private _lastPollAt: Date;
  private readonly _connectedAt: Date;
  private _messageQueue: QueuedMessage[];
  private _sequence: number;

  // Maximum messages to keep in queue (prevent memory bloat)
  private static readonly MAX_QUEUE_SIZE = 100;
  // Message TTL in milliseconds (5 minutes)
  private static readonly MESSAGE_TTL_MS = 5 * 60 * 1000;

  constructor(props: HttpClientProps) {
    this._deviceId = props.deviceId;
    this._tunnelId = props.tunnelId;
    this._status = 'active';
    this._lastPollAt = new Date();
    this._connectedAt = new Date();
    this._messageQueue = [];
    this._sequence = 0;
  }

  get deviceId(): string {
    return this._deviceId;
  }

  get tunnelId(): TunnelId {
    return this._tunnelId;
  }

  get status(): HttpClientStatus {
    return this._status;
  }

  get lastPollAt(): Date {
    return this._lastPollAt;
  }

  get connectedAt(): Date {
    return this._connectedAt;
  }

  get isActive(): boolean {
    return this._status === 'active';
  }

  get queueSize(): number {
    return this._messageQueue.length;
  }

  get currentSequence(): number {
    return this._sequence;
  }

  /**
   * Records a poll request, updating last poll timestamp.
   */
  recordPoll(): void {
    this._lastPollAt = new Date();
    this._status = 'active';
  }

  /**
   * Marks the client as inactive.
   */
  markInactive(): void {
    this._status = 'inactive';
  }

  /**
   * Queues a message for delivery to this client.
   */
  queueMessage(message: string): number {
    this._sequence++;
    const queuedMessage: QueuedMessage = {
      sequence: this._sequence,
      timestamp: new Date(),
      data: message,
    };

    this._messageQueue.push(queuedMessage);

    // Trim old messages if queue is too large
    if (this._messageQueue.length > HttpClient.MAX_QUEUE_SIZE) {
      this._messageQueue = this._messageQueue.slice(-HttpClient.MAX_QUEUE_SIZE);
    }

    return this._sequence;
  }

  /**
   * Gets messages since a given sequence number.
   * Also cleans up expired messages.
   * Returns both messages and metadata about potential gaps.
   */
  getMessagesSince(sinceSequence: number): {
    messages: QueuedMessage[];
    oldestAvailableSequence: number | null;
    mayHaveMissedMessages: boolean;
  } {
    const now = Date.now();

    // Clean up expired messages
    this._messageQueue = this._messageQueue.filter(
      (msg) => now - msg.timestamp.getTime() < HttpClient.MESSAGE_TTL_MS
    );

    // Store reference to cleaned queue for consistent access
    const cleanedQueue = this._messageQueue;

    // Get messages with sequence > sinceSequence
    const messages = cleanedQueue.filter((msg) => msg.sequence > sinceSequence);

    // Calculate oldest available sequence
    const firstMessage = cleanedQueue[0];
    const oldestAvailableSequence = firstMessage !== undefined
      ? firstMessage.sequence
      : null;

    // Detect if client may have missed messages
    // This happens when:
    // 1. Client is requesting from a sequence older than our oldest available
    // 2. There's a gap between what client has (sinceSequence) and our oldest
    // Note: sequence 0 means "give me everything" - that's not a stale request
    const mayHaveMissedMessages = sinceSequence > 0
      && oldestAvailableSequence !== null
      && sinceSequence < oldestAvailableSequence - 1;

    return { messages, oldestAvailableSequence, mayHaveMissedMessages };
  }

  /**
   * Clears messages up to a given sequence (acknowledged by client).
   */
  acknowledgeMessages(upToSequence: number): void {
    this._messageQueue = this._messageQueue.filter(
      (msg) => msg.sequence > upToSequence
    );
  }

  /**
   * Checks if the client has timed out (no poll received within timeout period).
   */
  hasTimedOut(timeoutMs: number): boolean {
    const elapsed = Date.now() - this._lastPollAt.getTime();
    return elapsed > timeoutMs;
  }
}
