/**
 * @file device-id.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

/**
 * Value object representing a unique mobile device identifier.
 */
export class DeviceId {
  private readonly _value: string;

  constructor(value: string) {
    if (!value || value.length < 1) {
      throw new Error('Device ID cannot be empty');
    }
    this._value = value;
  }

  get value(): string {
    return this._value;
  }

  equals(other: DeviceId): boolean {
    return this._value === other._value;
  }

  toString(): string {
    return this._value;
  }
}

