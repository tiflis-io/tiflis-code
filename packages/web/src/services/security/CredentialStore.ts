// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import type { Credentials } from '@/types';
import { logger } from '@/utils/logger';

const STORAGE_KEY = 'tiflis_credentials';
const DEVICE_ID_KEY = 'tiflis_device_id';
const ENCRYPTION_KEY_NAME = 'tiflis_encryption_key';
const DB_NAME = 'tiflis_security';
const DB_STORE_NAME = 'keys';

interface StoredCredentials {
  tunnelId: string;
  tunnelUrl: string;
  encryptedAuthKey: string;
  iv: string;
}

class CredentialStoreImpl {
  private encryptionKey: CryptoKey | null = null;

  /**
   * Get or generate a unique device ID
   */
  getDeviceId(): string {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  }

  /**
   * Store credentials securely with encryption
   */
  async storeCredentials(credentials: Omit<Credentials, 'deviceId'>): Promise<void> {
    const key = await this.getOrCreateEncryptionKey();
    const { encrypted, iv } = await this.encrypt(key, credentials.authKey);

    const stored: StoredCredentials = {
      tunnelId: credentials.tunnelId,
      tunnelUrl: credentials.tunnelUrl,
      encryptedAuthKey: encrypted,
      iv,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
  }

  /**
   * Retrieve and decrypt stored credentials
   */
  async getCredentials(): Promise<Credentials | null> {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;

    try {
      const parsed: StoredCredentials = JSON.parse(stored);
      const key = await this.getOrCreateEncryptionKey();
      const authKey = await this.decrypt(key, parsed.encryptedAuthKey, parsed.iv);

      return {
        tunnelId: parsed.tunnelId,
        tunnelUrl: parsed.tunnelUrl,
        authKey,
        deviceId: this.getDeviceId(),
      };
    } catch (error) {
      logger.error('Failed to decrypt credentials:', error);
      return null;
    }
  }

  /**
   * Check if credentials exist
   */
  hasCredentials(): boolean {
    return localStorage.getItem(STORAGE_KEY) !== null;
  }

  /**
   * Clear all stored credentials and encryption key
   */
  async forgetAll(): Promise<void> {
    // Clear localStorage
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(DEVICE_ID_KEY);

    // Clear IndexedDB encryption key
    try {
      await this.deleteEncryptionKey();
    } catch (error) {
      logger.error('Failed to delete encryption key:', error);
    }

    // Reset in-memory key
    this.encryptionKey = null;
  }

  /**
   * Get or create an AES-GCM encryption key stored in IndexedDB
   */
  private async getOrCreateEncryptionKey(): Promise<CryptoKey> {
    if (this.encryptionKey) {
      return this.encryptionKey;
    }

    // Try to load from IndexedDB
    const storedKey = await this.loadKeyFromDB();
    if (storedKey) {
      this.encryptionKey = storedKey;
      return storedKey;
    }

    // Generate a new key
    const newKey = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      false, // Not extractable for security
      ['encrypt', 'decrypt']
    );

    // Store in IndexedDB
    await this.saveKeyToDB(newKey);
    this.encryptionKey = newKey;
    return newKey;
  }

  /**
   * Encrypt data using AES-GCM
   */
  private async encrypt(
    key: CryptoKey,
    data: string
  ): Promise<{ encrypted: string; iv: string }> {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));

    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(data)
    );

    return {
      encrypted: this.bufferToBase64(new Uint8Array(encryptedBuffer)),
      iv: this.bufferToBase64(iv),
    };
  }

  /**
   * Decrypt data using AES-GCM
   */
  private async decrypt(
    key: CryptoKey,
    encryptedData: string,
    ivString: string
  ): Promise<string> {
    const decoder = new TextDecoder();
    const iv = this.base64ToBuffer(ivString);
    const data = this.base64ToBuffer(encryptedData);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
      key,
      data.buffer as ArrayBuffer
    );

    return decoder.decode(decryptedBuffer);
  }

  /**
   * Load encryption key from IndexedDB
   */
  private loadKeyFromDB(): Promise<CryptoKey | null> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
          db.createObjectStore(DB_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction(DB_STORE_NAME, 'readonly');
          const store = tx.objectStore(DB_STORE_NAME);
          const getRequest = store.get(ENCRYPTION_KEY_NAME);

          getRequest.onerror = () => {
            db.close();
            reject(getRequest.error);
          };

          getRequest.onsuccess = () => {
            db.close();
            resolve(getRequest.result ?? null);
          };
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    });
  }

  /**
   * Save encryption key to IndexedDB
   */
  private saveKeyToDB(key: CryptoKey): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);

      request.onerror = () => reject(request.error);

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DB_STORE_NAME)) {
          db.createObjectStore(DB_STORE_NAME);
        }
      };

      request.onsuccess = () => {
        const db = request.result;
        try {
          const tx = db.transaction(DB_STORE_NAME, 'readwrite');
          const store = tx.objectStore(DB_STORE_NAME);
          store.put(key, ENCRYPTION_KEY_NAME);

          tx.oncomplete = () => {
            db.close();
            resolve();
          };

          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        } catch (error) {
          db.close();
          reject(error);
        }
      };
    });
  }

  /**
   * Delete encryption key from IndexedDB
   */
  private deleteEncryptionKey(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);

      // Handle blocked event (when other connections are open)
      request.onblocked = () => {
        logger.warn('IndexedDB delete blocked by open connections, resolving anyway');
        resolve();
      };

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private bufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]!);
    }
    return btoa(binary);
  }

  private base64ToBuffer(base64: string): Uint8Array {
    const binary = atob(base64);
    const buffer = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      buffer[i] = binary.charCodeAt(i);
    }
    return buffer;
  }
}

export const CredentialStore = new CredentialStoreImpl();
