/**
 * @file tunnel-id.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import { TunnelId } from '../../../src/domain/value-objects/tunnel-id.js';

describe('TunnelId', () => {
  describe('create', () => {
    it('should create a valid TunnelId', () => {
      const tunnelId = TunnelId.create('abc123');
      expect(tunnelId.value).toBe('abc123');
    });

    it('should trim whitespace from the value', () => {
      const tunnelId = TunnelId.create('  abc123  ');
      expect(tunnelId.value).toBe('abc123');
    });

    it('should throw an error for empty string', () => {
      expect(() => TunnelId.create('')).toThrow('TunnelId cannot be empty');
    });

    it('should throw an error for whitespace-only string', () => {
      expect(() => TunnelId.create('   ')).toThrow('TunnelId cannot be empty');
    });
  });

  describe('generate', () => {
    it('should generate a TunnelId using the provided generator', () => {
      const tunnelId = TunnelId.generate(() => 'generated-id');
      expect(tunnelId.value).toBe('generated-id');
    });
  });

  describe('equals', () => {
    it('should return true for equal TunnelIds', () => {
      const id1 = TunnelId.create('abc123');
      const id2 = TunnelId.create('abc123');
      expect(id1.equals(id2)).toBe(true);
    });

    it('should return false for different TunnelIds', () => {
      const id1 = TunnelId.create('abc123');
      const id2 = TunnelId.create('xyz789');
      expect(id1.equals(id2)).toBe(false);
    });
  });

  describe('toString', () => {
    it('should return the tunnel ID value', () => {
      const tunnelId = TunnelId.create('abc123');
      expect(tunnelId.toString()).toBe('abc123');
    });
  });
});

