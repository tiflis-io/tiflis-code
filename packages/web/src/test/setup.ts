/**
 * @file setup.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import '@testing-library/jest-dom';
import { vi, beforeEach } from 'vitest';

// Mock crypto.subtle for tests
const mockCrypto = {
  subtle: {
    generateKey: vi.fn().mockResolvedValue({
      type: 'secret',
      algorithm: { name: 'AES-GCM', length: 256 },
      extractable: false,
      usages: ['encrypt', 'decrypt'],
    }),
    encrypt: vi.fn().mockImplementation(async (_algorithm, _key, data) => {
      // Return mock encrypted data (prepend 12-byte IV)
      const iv = new Uint8Array(12);
      const encrypted = new Uint8Array(data);
      const result = new Uint8Array(iv.length + encrypted.length);
      result.set(iv);
      result.set(encrypted, iv.length);
      return result.buffer;
    }),
    decrypt: vi.fn().mockImplementation(async (_algorithm, _key, data) => {
      // Return data without the 12-byte IV prefix
      const dataArray = new Uint8Array(data);
      return dataArray.slice(12).buffer;
    }),
  },
  getRandomValues: vi.fn((array: Uint8Array) => {
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
    return array;
  }),
};

// Only mock if not already available
if (typeof globalThis.crypto === 'undefined') {
  Object.defineProperty(globalThis, 'crypto', {
    value: mockCrypto,
    writable: true,
  });
}

// Mock indexedDB
const mockIndexedDB = {
  open: vi.fn().mockImplementation((_name: string) => {
    const request = {
      result: {
        createObjectStore: vi.fn(),
        transaction: vi.fn().mockReturnValue({
          objectStore: vi.fn().mockReturnValue({
            put: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            get: vi.fn().mockReturnValue({ onsuccess: null, onerror: null, result: null }),
            delete: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
            clear: vi.fn().mockReturnValue({ onsuccess: null, onerror: null }),
          }),
        }),
        objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
      },
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
    };
    setTimeout(() => {
      if (request.onsuccess) {
        (request.onsuccess as (event: unknown) => void)({ target: request });
      }
    }, 0);
    return request;
  }),
  deleteDatabase: vi.fn(),
};

if (typeof globalThis.indexedDB === 'undefined') {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: mockIndexedDB,
    writable: true,
  });
}

// Mock WebSocket
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  url: string;
  onopen: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(url: string) {
    this.url = url;
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    }, 0);
  }

  send = vi.fn();
  close = vi.fn().mockImplementation(() => {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close'));
    }
  });
}

if (typeof globalThis.WebSocket === 'undefined') {
  Object.defineProperty(globalThis, 'WebSocket', {
    value: MockWebSocket,
    writable: true,
  });
}

// Mock localStorage
const localStorageMock = {
  store: {} as Record<string, string>,
  getItem: vi.fn((key: string) => localStorageMock.store[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    localStorageMock.store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete localStorageMock.store[key];
  }),
  clear: vi.fn(() => {
    localStorageMock.store = {};
  }),
  get length() {
    return Object.keys(localStorageMock.store).length;
  },
  key: vi.fn((index: number) => Object.keys(localStorageMock.store)[index] || null),
};

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

// Mock matchMedia
Object.defineProperty(globalThis, 'matchMedia', {
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
  writable: true,
});

// Mock ResizeObserver
class MockResizeObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  value: MockResizeObserver,
  writable: true,
});

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  localStorageMock.store = {};
});
