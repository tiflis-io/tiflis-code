/**
 * @file auth-key.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { timingSafeEqual } from 'crypto';

/**
 * Value object representing an authentication key.
 * Used for mobile client authorization.
 */
export class AuthKey {
  private readonly _value: string;

  constructor(value: string) {
    if (!value || value.length < 16) {
      throw new Error('Auth key must be at least 16 characters');
    }
    this._value = value;
  }

  get value(): string {
    return this._value;
  }

  /**
   * Performs a timing-safe comparison with another auth key.
   * Prevents timing attacks when comparing authentication credentials.
   */
  secureEquals(other: AuthKey): boolean {
    const a = Buffer.from(this._value);
    const b = Buffer.from(other._value);

    if (a.length !== b.length) {
      return false;
    }

    return timingSafeEqual(a, b);
  }

  toString(): string {
    // Mask the auth key for logging purposes
    return `${this._value.slice(0, 4)}****`;
  }
}

