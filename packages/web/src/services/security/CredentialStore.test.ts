/**
 * @file CredentialStore.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const STORAGE_KEY = 'tiflis_credentials';
const DEVICE_ID_KEY = 'tiflis_device_id';

describe('CredentialStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    // Reset module cache to get fresh instance
    vi.resetModules();
  });

  describe('getDeviceId', () => {
    it('should generate a new device ID if none exists', async () => {
      const { CredentialStore } = await import('./CredentialStore');

      const deviceId = CredentialStore.getDeviceId();

      expect(deviceId).toBeDefined();
      expect(typeof deviceId).toBe('string');
      expect(deviceId.length).toBeGreaterThan(0);
    });

    it('should return the same device ID on subsequent calls', async () => {
      const { CredentialStore } = await import('./CredentialStore');

      const firstId = CredentialStore.getDeviceId();
      const secondId = CredentialStore.getDeviceId();

      expect(firstId).toBe(secondId);
    });

    it('should persist device ID to localStorage', async () => {
      const { CredentialStore } = await import('./CredentialStore');

      const deviceId = CredentialStore.getDeviceId();
      const storedId = localStorage.getItem(DEVICE_ID_KEY);

      expect(storedId).toBe(deviceId);
    });

    it('should return existing device ID from localStorage', async () => {
      const existingId = 'existing-device-id-123';
      localStorage.setItem(DEVICE_ID_KEY, existingId);

      const { CredentialStore } = await import('./CredentialStore');

      const deviceId = CredentialStore.getDeviceId();

      expect(deviceId).toBe(existingId);
    });
  });

  describe('hasCredentials', () => {
    it('should return false when no credentials stored', async () => {
      const { CredentialStore } = await import('./CredentialStore');

      expect(CredentialStore.hasCredentials()).toBe(false);
    });

    it('should return true when credentials exist', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        tunnelId: 'test-tunnel',
        tunnelUrl: 'wss://test.example.com',
        encryptedAuthKey: 'encrypted',
        iv: 'iv',
      }));

      const { CredentialStore } = await import('./CredentialStore');

      expect(CredentialStore.hasCredentials()).toBe(true);
    });
  });

  describe('getCredentials', () => {
    it('should return null when no credentials stored', async () => {
      const { CredentialStore } = await import('./CredentialStore');

      const credentials = await CredentialStore.getCredentials();

      expect(credentials).toBeNull();
    });
  });
});

describe('Base64 encoding/decoding', () => {
  it('should correctly encode and decode binary data', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64]);

    // Simulate the encoding (same logic as in CredentialStore)
    let binary = '';
    for (let i = 0; i < original.byteLength; i++) {
      binary += String.fromCharCode(original[i]!);
    }
    const encoded = btoa(binary);

    // Simulate the decoding
    const decodedBinary = atob(encoded);
    const decoded = new Uint8Array(decodedBinary.length);
    for (let i = 0; i < decodedBinary.length; i++) {
      decoded[i] = decodedBinary.charCodeAt(i);
    }

    expect(decoded).toEqual(original);
  });

  it('should handle empty array', () => {
    const original = new Uint8Array([]);

    let binary = '';
    for (let i = 0; i < original.byteLength; i++) {
      binary += String.fromCharCode(original[i]!);
    }
    const encoded = btoa(binary);

    expect(encoded).toBe('');
  });

  it('should handle single byte', () => {
    const original = new Uint8Array([42]);

    let binary = '';
    for (let i = 0; i < original.byteLength; i++) {
      binary += String.fromCharCode(original[i]!);
    }
    const encoded = btoa(binary);
    const decoded = atob(encoded);

    expect(decoded.charCodeAt(0)).toBe(42);
  });
});
