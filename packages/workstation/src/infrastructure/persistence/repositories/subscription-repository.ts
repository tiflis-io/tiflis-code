/**
 * @file subscription-repository.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { eq, and } from 'drizzle-orm';
import { getDatabase } from '../database/client.js';
import {
  subscriptions,
  type SubscriptionRow,
  type NewSubscriptionRow,
} from '../database/schema.js';

/**
 * Repository for subscription persistence operations.
 * Stores client subscriptions to sessions for recovery after workstation restart.
 */
export class SubscriptionRepository {
  /**
   * Creates or updates a subscription.
   * Uses INSERT OR REPLACE to handle existing subscriptions.
   */
  subscribe(deviceId: string, sessionId: string): SubscriptionRow {
    const db = getDatabase();
    const id = `${deviceId}:${sessionId}`;
    const newSubscription: NewSubscriptionRow = {
      id,
      deviceId,
      sessionId,
      subscribedAt: new Date(),
    };

    db.insert(subscriptions)
      .values(newSubscription)
      .onConflictDoUpdate({
        target: subscriptions.id,
        set: {
          subscribedAt: new Date(),
        },
      })
      .run();

    return newSubscription as SubscriptionRow;
  }

  /**
   * Removes a subscription.
   */
  unsubscribe(deviceId: string, sessionId: string): boolean {
    const db = getDatabase();
    const result = db
      .delete(subscriptions)
      .where(
        and(
          eq(subscriptions.deviceId, deviceId),
          eq(subscriptions.sessionId, sessionId)
        )
      )
      .run();
    return result.changes > 0;
  }

  /**
   * Gets all subscriptions for a device.
   * Returns session IDs that the device was subscribed to.
   */
  getByDeviceId(deviceId: string): SubscriptionRow[] {
    const db = getDatabase();
    return db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.deviceId, deviceId))
      .all();
  }

  /**
   * Gets session IDs for a device (convenience method).
   */
  getSessionIdsForDevice(deviceId: string): string[] {
    return this.getByDeviceId(deviceId).map((sub) => sub.sessionId);
  }

  /**
   * Removes all subscriptions for a device.
   * Called when a device disconnects.
   */
  clearDevice(deviceId: string): number {
    const db = getDatabase();
    const result = db
      .delete(subscriptions)
      .where(eq(subscriptions.deviceId, deviceId))
      .run();
    return result.changes;
  }

  /**
   * Removes all subscriptions for a session.
   * Called when a session is terminated.
   */
  clearSession(sessionId: string): number {
    const db = getDatabase();
    const result = db
      .delete(subscriptions)
      .where(eq(subscriptions.sessionId, sessionId))
      .run();
    return result.changes;
  }

  /**
   * Gets all devices subscribed to a session.
   */
  getDevicesForSession(sessionId: string): string[] {
    const db = getDatabase();
    const rows = db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.sessionId, sessionId))
      .all();
    return rows.map((sub) => sub.deviceId);
  }

  /**
   * Checks if a subscription exists.
   */
  exists(deviceId: string, sessionId: string): boolean {
    const db = getDatabase();
    const row = db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.deviceId, deviceId),
          eq(subscriptions.sessionId, sessionId)
        )
      )
      .get();
    return row !== undefined;
  }
}
