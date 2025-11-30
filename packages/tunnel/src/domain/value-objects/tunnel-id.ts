/**
 * @file tunnel-id.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

/**
 * Value object representing a unique tunnel identifier.
 * Tunnel ID is used to route messages between mobile clients and workstations.
 */
export class TunnelId {
  private readonly _value: string;

  private constructor(value: string) {
    this._value = value;
  }

  get value(): string {
    return this._value;
  }

  static create(value: string): TunnelId {
    if (!value || value.trim().length === 0) {
      throw new Error('TunnelId cannot be empty');
    }
    return new TunnelId(value.trim());
  }

  static generate(generator: () => string): TunnelId {
    return new TunnelId(generator());
  }

  equals(other: TunnelId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

