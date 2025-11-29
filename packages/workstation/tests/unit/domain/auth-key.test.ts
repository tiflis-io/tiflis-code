/**
 * @file auth-key.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { AuthKey } from '../../../src/domain/value-objects/auth-key.js';

describe('AuthKey', () => {
  it('should create a valid auth key', () => {
    const key = new AuthKey('valid-auth-key-16ch');
    expect(key.value).toBe('valid-auth-key-16ch');
  });

  it('should throw for empty auth key', () => {
    expect(() => new AuthKey('')).toThrow('Auth key must be at least 16 characters');
  });

  it('should throw for short auth key', () => {
    expect(() => new AuthKey('short')).toThrow('Auth key must be at least 16 characters');
  });

  it('should securely compare equal keys', () => {
    const key1 = new AuthKey('valid-auth-key-16ch');
    const key2 = new AuthKey('valid-auth-key-16ch');
    expect(key1.secureEquals(key2)).toBe(true);
  });

  it('should securely compare different keys', () => {
    const key1 = new AuthKey('valid-auth-key-one');
    const key2 = new AuthKey('valid-auth-key-two');
    expect(key1.secureEquals(key2)).toBe(false);
  });

  it('should mask key in toString', () => {
    const key = new AuthKey('secret-auth-key-here');
    expect(key.toString()).toBe('secr****');
  });
});

