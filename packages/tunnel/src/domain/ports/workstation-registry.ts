/**
 * @file workstation-registry.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import type { Workstation } from '../entities/workstation.js';
import type { TunnelId } from '../value-objects/tunnel-id.js';

/**
 * Port (interface) for workstation registry.
 * Manages the collection of registered workstations.
 */
export interface WorkstationRegistry {
  /**
   * Registers a new workstation.
   */
  register(workstation: Workstation): void;

  /**
   * Removes a workstation from the registry.
   */
  unregister(tunnelId: TunnelId): boolean;

  /**
   * Retrieves a workstation by tunnel ID.
   */
  get(tunnelId: TunnelId): Workstation | undefined;

  /**
   * Checks if a tunnel ID is already registered.
   */
  has(tunnelId: TunnelId): boolean;

  /**
   * Returns all registered workstations.
   */
  getAll(): Workstation[];

  /**
   * Returns the count of registered workstations.
   */
  count(): number;

  /**
   * Finds workstations that have timed out.
   */
  findTimedOut(timeoutMs: number): Workstation[];
}

