/**
 * @file subscription-service.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { Logger } from 'pino';
import type { ClientRegistry } from '../../domain/ports/client-registry.js';
import type { SessionManager } from '../../domain/ports/session-manager.js';
import { DeviceId } from '../../domain/value-objects/device-id.js';
import { SessionId } from '../../domain/value-objects/session-id.js';
import { SessionNotFoundError } from '../../domain/errors/domain-errors.js';
import type {
  SessionSubscribedMessage,
  SessionUnsubscribedMessage,
} from '../../protocol/messages.js';

export interface SubscriptionServiceDeps {
  clientRegistry: ClientRegistry;
  sessionManager: SessionManager;
  logger: Logger;
}

/**
 * Service for managing session subscriptions.
 */
export class SubscriptionService {
  private readonly deps: SubscriptionServiceDeps;
  private readonly logger: Logger;

  constructor(deps: SubscriptionServiceDeps) {
    this.deps = deps;
    this.logger = deps.logger.child({ service: 'subscription' });
  }

  /**
   * Subscribes a client to a session.
   */
  subscribe(deviceId: string, sessionId: string): SessionSubscribedMessage {
    const device = new DeviceId(deviceId);
    const session = new SessionId(sessionId);

    // Verify session exists
    const sessionEntity = this.deps.sessionManager.getSession(session);
    if (!sessionEntity) {
      throw new SessionNotFoundError(sessionId);
    }

    // Get client
    const client = this.deps.clientRegistry.getByDeviceId(device);
    if (!client) {
      throw new Error('Client not found');
    }

    // Subscribe
    const isNew = client.subscribe(session);
    
    this.logger.debug(
      { deviceId, sessionId, isNew },
      'Client subscribed to session'
    );

    return {
      type: 'session.subscribed',
      session_id: sessionId,
    };
  }

  /**
   * Unsubscribes a client from a session.
   */
  unsubscribe(deviceId: string, sessionId: string): SessionUnsubscribedMessage {
    const device = new DeviceId(deviceId);
    const session = new SessionId(sessionId);

    // Get client
    const client = this.deps.clientRegistry.getByDeviceId(device);
    if (!client) {
      throw new Error('Client not found');
    }

    // Unsubscribe
    client.unsubscribe(session);
    
    this.logger.debug(
      { deviceId, sessionId },
      'Client unsubscribed from session'
    );

    return {
      type: 'session.unsubscribed',
      session_id: sessionId,
    };
  }

  /**
   * Gets all subscribed session IDs for a client.
   */
  getClientSubscriptions(deviceId: string): string[] {
    const device = new DeviceId(deviceId);
    const client = this.deps.clientRegistry.getByDeviceId(device);
    
    if (!client) {
      return [];
    }

    return client.getSubscriptions();
  }

  /**
   * Gets all device IDs subscribed to a session.
   */
  getSubscribers(sessionId: string): string[] {
    const session = new SessionId(sessionId);
    const subscribers: string[] = [];

    // Iterate over all clients and check their subscriptions
    for (const client of this.deps.clientRegistry.getAll()) {
      if (client.isSubscribedTo(session)) {
        subscribers.push(client.deviceId.value);
      }
    }

    return subscribers;
  }
}

