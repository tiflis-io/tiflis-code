/**
 * @file session-id.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

/**
 * Value object representing a unique session identifier.
 */
export class SessionId {
  private readonly _value: string;

  constructor(value: string) {
    if (!value || value.length < 8) {
      throw new Error('Session ID must be at least 8 characters');
    }
    this._value = value;
  }

  get value(): string {
    return this._value;
  }

  equals(other: SessionId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

