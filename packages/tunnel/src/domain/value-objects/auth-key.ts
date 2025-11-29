/**
 * @file auth-key.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

const MIN_AUTH_KEY_LENGTH = 16;

/**
 * Value object representing an authentication key.
 * Used for workstation registration and mobile client authorization.
 */
export class AuthKey {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  get value(): string {
    return this._value;
  }

  static create(value: string): AuthKey {
    if (!value || value.trim().length < MIN_AUTH_KEY_LENGTH) {
      throw new Error(`AuthKey must be at least ${MIN_AUTH_KEY_LENGTH} characters`);
    }
    return new AuthKey(value.trim());
  }

  /**
   * Creates an AuthKey without validation.
   * Use for cases where the key was already validated (e.g., from storage).
   */
  static fromTrusted(value: string): AuthKey {
    return new AuthKey(value);
  }

  equals(other: AuthKey): boolean {
    return this._value === other._value;
  }

  /**
   * Performs a timing-safe comparison to prevent timing attacks.
   */
  secureEquals(other: AuthKey): boolean {
    const a = this._value;
    const b = other._value;

    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return result === 0;
  }

  toString(): string {
    // Never expose the full key in logs
    return `${this._value.substring(0, 4)}****`;
  }
}

