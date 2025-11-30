/**
 * @file auth-key.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { AuthKey } from '../../../src/domain/value-objects/auth-key.js';

describe('AuthKey', () => {
  const validKey = 'this-is-a-valid-key-1234567890';

  describe('create', () => {
    it('should create a valid AuthKey', () => {
      const authKey = AuthKey.create(validKey);
      expect(authKey.value).toBe(validKey);
    });

    it('should trim whitespace from the value', () => {
      const authKey = AuthKey.create(`  ${validKey}  `);
      expect(authKey.value).toBe(validKey);
    });

    it('should throw an error for empty string', () => {
      expect(() => AuthKey.create('')).toThrow('AuthKey must be at least 16 characters');
    });

    it('should throw an error for short key', () => {
      expect(() => AuthKey.create('short')).toThrow('AuthKey must be at least 16 characters');
    });

    it('should accept exactly 16 characters', () => {
      const key = 'exactly16chars!!';
      expect(key.length).toBe(16);
      const authKey = AuthKey.create(key);
      expect(authKey.value).toBe(key);
    });
  });

  describe('fromTrusted', () => {
    it('should create an AuthKey without validation', () => {
      const authKey = AuthKey.fromTrusted('short');
      expect(authKey.value).toBe('short');
    });
  });

  describe('equals', () => {
    it('should return true for equal AuthKeys', () => {
      const key1 = AuthKey.create(validKey);
      const key2 = AuthKey.create(validKey);
      expect(key1.equals(key2)).toBe(true);
    });

    it('should return false for different AuthKeys', () => {
      const key1 = AuthKey.create(validKey);
      const key2 = AuthKey.create('different-key-12345678');
      expect(key1.equals(key2)).toBe(false);
    });
  });

  describe('secureEquals', () => {
    it('should return true for equal AuthKeys', () => {
      const key1 = AuthKey.create(validKey);
      const key2 = AuthKey.create(validKey);
      expect(key1.secureEquals(key2)).toBe(true);
    });

    it('should return false for different AuthKeys', () => {
      const key1 = AuthKey.create(validKey);
      const key2 = AuthKey.create('different-key-12345678');
      expect(key1.secureEquals(key2)).toBe(false);
    });

    it('should return false for different length keys', () => {
      const key1 = AuthKey.fromTrusted('short');
      const key2 = AuthKey.fromTrusted('longer-key');
      expect(key1.secureEquals(key2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return masked auth key', () => {
      const authKey = AuthKey.create(validKey);
      expect(authKey.toString()).toBe('this****');
      expect(authKey.toString()).not.toContain(validKey.substring(4));
    });
  });
});

