/**
 * @file WebSocketService.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Credentials, ConnectionState } from '@/types';

// Mock WebSocket class
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

  sentMessages: string[] = [];

  constructor(url: string) {
    this.url = url;
  }

  send(data: string) {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string) {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new CloseEvent('close', { code, reason }));
    }
  }

  // Helper to simulate opening connection
  simulateOpen() {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event('open'));
    }
  }

  // Helper to simulate receiving a message
  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage(new MessageEvent('message', { data: JSON.stringify(data) }));
    }
  }

  // Helper to simulate an error
  simulateError() {
    if (this.onerror) {
      this.onerror(new Event('error'));
    }
  }
}

// Store the original WebSocket
const OriginalWebSocket = globalThis.WebSocket;

describe('WebSocketService', () => {
  let mockWs: MockWebSocket;
  let connectionStateChanges: ConnectionState[];
  let receivedMessages: unknown[];
  let workstationOnlineCalled: boolean;
  let workstationOfflineCalled: boolean;

  const mockCredentials: Credentials = {
    tunnelId: 'test-tunnel-123',
    tunnelUrl: 'wss://tunnel.example.com/ws',
    authKey: 'test-auth-key',
    deviceId: 'test-device-id',
  };

  const mockCallbacks = {
    onConnectionStateChange: (state: ConnectionState) => {
      connectionStateChanges.push(state);
    },
    onMessage: (message: unknown) => {
      receivedMessages.push(message);
    },
    onWorkstationOnline: () => {
      workstationOnlineCalled = true;
    },
    onWorkstationOffline: () => {
      workstationOfflineCalled = true;
    },
  };

  beforeEach(() => {
    vi.useFakeTimers();
    connectionStateChanges = [];
    receivedMessages = [];
    workstationOnlineCalled = false;
    workstationOfflineCalled = false;

    // Mock WebSocket constructor
    globalThis.WebSocket = vi.fn().mockImplementation((url: string) => {
      mockWs = new MockWebSocket(url);
      return mockWs;
    }) as unknown as typeof WebSocket;

    // Copy static properties
    (globalThis.WebSocket as unknown as Record<string, number>).CONNECTING = 0;
    (globalThis.WebSocket as unknown as Record<string, number>).OPEN = 1;
    (globalThis.WebSocket as unknown as Record<string, number>).CLOSING = 2;
    (globalThis.WebSocket as unknown as Record<string, number>).CLOSED = 3;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = OriginalWebSocket;
    vi.resetModules();
  });

  describe('init', () => {
    it('should initialize with callbacks', async () => {
      const { WebSocketService } = await import('./WebSocketService');

      WebSocketService.init(mockCallbacks);

      // No error thrown means success
      expect(true).toBe(true);
    });
  });

  describe('connect', () => {
    it('should establish connection and send connect message', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      // Simulate WebSocket opening
      mockWs.simulateOpen();

      // Check connect message was sent
      expect(mockWs.sentMessages.length).toBe(1);
      const connectMsg = JSON.parse(mockWs.sentMessages[0]!);
      expect(connectMsg.type).toBe('connect');
      expect(connectMsg.payload.tunnel_id).toBe(mockCredentials.tunnelId);
      expect(connectMsg.payload.auth_key).toBe(mockCredentials.authKey);
      expect(connectMsg.payload.device_id).toBe(mockCredentials.deviceId);

      // Simulate server responses
      mockWs.simulateMessage({ type: 'connected' });

      // Auth message should be sent
      expect(mockWs.sentMessages.length).toBe(2);
      const authMsg = JSON.parse(mockWs.sentMessages[1]!);
      expect(authMsg.type).toBe('auth');

      // Simulate auth success
      mockWs.simulateMessage({ type: 'auth.success' });

      await connectPromise;

      expect(connectionStateChanges).toContain('connecting');
      expect(connectionStateChanges).toContain('connected');
      expect(connectionStateChanges).toContain('authenticating');
      expect(connectionStateChanges).toContain('authenticated');
    });

    it('should reject on auth error', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      mockWs.simulateOpen();
      mockWs.simulateMessage({ type: 'connected' });
      mockWs.simulateMessage({
        type: 'auth.error',
        payload: { code: 'INVALID_KEY', message: 'Invalid auth key' },
      });

      await expect(connectPromise).rejects.toThrow('Auth failed');
      expect(connectionStateChanges).toContain('error');
    });
  });

  describe('disconnect', () => {
    it('should close the connection', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      mockWs.simulateOpen();
      mockWs.simulateMessage({ type: 'connected' });
      mockWs.simulateMessage({ type: 'auth.success' });

      await connectPromise;

      WebSocketService.disconnect();

      expect(connectionStateChanges).toContain('disconnected');
    });
  });

  describe('isConnected', () => {
    it('should return false when not connected', async () => {
      const { WebSocketService } = await import('./WebSocketService');

      expect(WebSocketService.isConnected()).toBe(false);
    });

    it('should return true when authenticated', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      mockWs.simulateOpen();
      mockWs.simulateMessage({ type: 'connected' });
      mockWs.simulateMessage({ type: 'auth.success' });

      await connectPromise;

      expect(WebSocketService.isConnected()).toBe(true);
    });
  });

  describe('send', () => {
    it('should send message when connected', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      mockWs.simulateOpen();
      mockWs.simulateMessage({ type: 'connected' });
      mockWs.simulateMessage({ type: 'auth.success' });

      await connectPromise;

      const msgCountBefore = mockWs.sentMessages.length;
      WebSocketService.send({ type: 'test', data: 'hello' });

      expect(mockWs.sentMessages.length).toBe(msgCountBefore + 1);
      const sentMsg = JSON.parse(mockWs.sentMessages[mockWs.sentMessages.length - 1]!);
      expect(sentMsg.type).toBe('test');
      expect(sentMsg.data).toBe('hello');
    });

    it('should not send when not connected', async () => {
      const { WebSocketService } = await import('./WebSocketService');

      WebSocketService.send({ type: 'test' });

      // No error thrown, message just ignored
      expect(true).toBe(true);
    });
  });

  describe('workstation events', () => {
    it('should call onWorkstationOnline when workstation comes online', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      mockWs.simulateOpen();
      mockWs.simulateMessage({ type: 'connected' });
      mockWs.simulateMessage({ type: 'auth.success' });

      await connectPromise;

      mockWs.simulateMessage({ type: 'connection.workstation_online' });

      expect(workstationOnlineCalled).toBe(true);
    });

    it('should call onWorkstationOffline when workstation goes offline', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      mockWs.simulateOpen();
      mockWs.simulateMessage({ type: 'connected' });
      mockWs.simulateMessage({ type: 'auth.success' });

      await connectPromise;

      mockWs.simulateMessage({ type: 'connection.workstation_offline' });

      expect(workstationOfflineCalled).toBe(true);
    });
  });

  describe('heartbeat', () => {
    it('should send heartbeat after authentication', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      mockWs.simulateOpen();
      mockWs.simulateMessage({ type: 'connected' });
      mockWs.simulateMessage({ type: 'auth.success' });

      await connectPromise;

      // Find heartbeat message
      const heartbeatMsg = mockWs.sentMessages.find((msg) => {
        const parsed = JSON.parse(msg);
        return parsed.type === 'heartbeat';
      });

      expect(heartbeatMsg).toBeDefined();
    });

    it('should update state on heartbeat ack', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      mockWs.simulateOpen();
      mockWs.simulateMessage({ type: 'connected' });
      mockWs.simulateMessage({ type: 'auth.success' });

      await connectPromise;

      mockWs.simulateMessage({ type: 'heartbeat.ack' });

      expect(connectionStateChanges).toContain('verified');
    });
  });

  describe('message forwarding', () => {
    it('should forward unknown message types to callback', async () => {
      const { WebSocketService } = await import('./WebSocketService');
      WebSocketService.init(mockCallbacks);

      const connectPromise = WebSocketService.connect(mockCredentials);

      mockWs.simulateOpen();
      mockWs.simulateMessage({ type: 'connected' });
      mockWs.simulateMessage({ type: 'auth.success' });

      await connectPromise;

      const customMessage = { type: 'custom.event', payload: { data: 'test' } };
      mockWs.simulateMessage(customMessage);

      // 2 messages: auth.success (forwarded for workstation info) + custom message
      expect(receivedMessages.length).toBe(2);
      expect(receivedMessages[0]).toEqual({ type: 'auth.success' });
      expect(receivedMessages[1]).toEqual(customMessage);
    });
  });
});
