/**
 * @file useChatStore.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from './useChatStore';
import type { Message, ContentBlock, MessageRole } from '@/types';

describe('useChatStore', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  const createMockMessage = (id: string, role: MessageRole = 'user'): Message => ({
    id,
    sessionId: 'test-session',
    role,
    contentBlocks: [{ id: `${id}-block`, blockType: 'text', content: `Test message ${id}` }],
    isStreaming: false,
    createdAt: new Date(),
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useChatStore.getState();

      expect(state.supervisorMessages).toEqual([]);
      expect(state.agentMessages).toEqual({});
      expect(state.supervisorIsLoading).toBe(false);
      expect(state.agentIsLoading).toEqual({});
      expect(state.supervisorStreamingMessageId).toBeNull();
      expect(state.agentStreamingMessageIds).toEqual({});
      expect(state.pendingMessageAcks.size).toBe(0);
    });
  });

  describe('supervisor messages', () => {
    it('should add supervisor message', () => {
      const message = createMockMessage('msg-1');

      useChatStore.getState().addSupervisorMessage(message);

      expect(useChatStore.getState().supervisorMessages).toHaveLength(1);
      expect(useChatStore.getState().supervisorMessages[0]).toEqual(message);
    });

    it('should update supervisor message', () => {
      const message = createMockMessage('msg-1');
      useChatStore.getState().addSupervisorMessage(message);

      useChatStore.getState().updateSupervisorMessage('msg-1', {
        isStreaming: true,
      });

      expect(useChatStore.getState().supervisorMessages[0]?.isStreaming).toBe(true);
    });

    it('should update supervisor streaming blocks', () => {
      const message = createMockMessage('msg-1', 'assistant');
      useChatStore.getState().addSupervisorMessage(message);

      const blocks: ContentBlock[] = [
        { id: 'block-1', blockType: 'text', content: 'Hello' },
        { id: 'block-2', blockType: 'code', content: 'console.log("test")' },
      ];

      useChatStore.getState().updateSupervisorStreamingBlocks('msg-1', blocks);

      expect(useChatStore.getState().supervisorMessages[0]?.contentBlocks).toEqual(blocks);
    });

    it('should set supervisor loading state', () => {
      useChatStore.getState().setSupervisorIsLoading(true);
      expect(useChatStore.getState().supervisorIsLoading).toBe(true);

      useChatStore.getState().setSupervisorIsLoading(false);
      expect(useChatStore.getState().supervisorIsLoading).toBe(false);
    });

    it('should set supervisor streaming message id', () => {
      useChatStore.getState().setSupervisorStreamingMessageId('msg-1');
      expect(useChatStore.getState().supervisorStreamingMessageId).toBe('msg-1');

      useChatStore.getState().setSupervisorStreamingMessageId(null);
      expect(useChatStore.getState().supervisorStreamingMessageId).toBeNull();
    });

    it('should clear supervisor messages', () => {
      useChatStore.getState().addSupervisorMessage(createMockMessage('msg-1'));
      useChatStore.getState().addSupervisorMessage(createMockMessage('msg-2'));

      useChatStore.getState().clearSupervisorMessages();

      expect(useChatStore.getState().supervisorMessages).toEqual([]);
    });
  });

  describe('agent messages', () => {
    const sessionId = 'session-1';

    it('should add agent message', () => {
      const message = createMockMessage('msg-1');

      useChatStore.getState().addAgentMessage(sessionId, message);

      expect(useChatStore.getState().agentMessages[sessionId]).toHaveLength(1);
      expect(useChatStore.getState().agentMessages[sessionId]?.[0]).toEqual(message);
    });

    it('should add multiple messages to same session', () => {
      useChatStore.getState().addAgentMessage(sessionId, createMockMessage('msg-1'));
      useChatStore.getState().addAgentMessage(sessionId, createMockMessage('msg-2'));

      expect(useChatStore.getState().agentMessages[sessionId]).toHaveLength(2);
    });

    it('should handle messages for different sessions', () => {
      useChatStore.getState().addAgentMessage('session-1', createMockMessage('msg-1'));
      useChatStore.getState().addAgentMessage('session-2', createMockMessage('msg-2'));

      expect(useChatStore.getState().agentMessages['session-1']).toHaveLength(1);
      expect(useChatStore.getState().agentMessages['session-2']).toHaveLength(1);
    });

    it('should update agent message', () => {
      const message = createMockMessage('msg-1');
      useChatStore.getState().addAgentMessage(sessionId, message);

      useChatStore.getState().updateAgentMessage(sessionId, 'msg-1', {
        isStreaming: true,
      });

      expect(useChatStore.getState().agentMessages[sessionId]?.[0]?.isStreaming).toBe(true);
    });

    it('should update agent streaming blocks', () => {
      const message = createMockMessage('msg-1', 'assistant');
      useChatStore.getState().addAgentMessage(sessionId, message);

      const blocks: ContentBlock[] = [
        { id: 'block-1', blockType: 'text', content: 'Hello' },
      ];

      useChatStore.getState().updateAgentStreamingBlocks(sessionId, 'msg-1', blocks);

      expect(useChatStore.getState().agentMessages[sessionId]?.[0]?.contentBlocks).toEqual(blocks);
    });

    it('should set agent loading state', () => {
      useChatStore.getState().setAgentIsLoading(sessionId, true);
      expect(useChatStore.getState().agentIsLoading[sessionId]).toBe(true);

      useChatStore.getState().setAgentIsLoading(sessionId, false);
      expect(useChatStore.getState().agentIsLoading[sessionId]).toBe(false);
    });

    it('should set agent streaming message id', () => {
      useChatStore.getState().setAgentStreamingMessageId(sessionId, 'msg-1');
      expect(useChatStore.getState().agentStreamingMessageIds[sessionId]).toBe('msg-1');

      useChatStore.getState().setAgentStreamingMessageId(sessionId, null);
      expect(useChatStore.getState().agentStreamingMessageIds[sessionId]).toBe('');
    });

    it('should clear agent messages for specific session', () => {
      useChatStore.getState().addAgentMessage('session-1', createMockMessage('msg-1'));
      useChatStore.getState().addAgentMessage('session-2', createMockMessage('msg-2'));

      useChatStore.getState().clearAgentMessages('session-1');

      expect(useChatStore.getState().agentMessages['session-1']).toEqual([]);
      expect(useChatStore.getState().agentMessages['session-2']).toHaveLength(1);
    });
  });

  describe('message status', () => {
    it('should set send status for supervisor message', () => {
      const message: Message = {
        ...createMockMessage('msg-1'),
        sendStatus: 'pending',
      };
      useChatStore.getState().addSupervisorMessage(message);

      useChatStore.getState().setMessageSendStatus('msg-1', 'sent');

      expect(useChatStore.getState().supervisorMessages[0]?.sendStatus).toBe('sent');
    });

    it('should set send status for agent message', () => {
      const message: Message = {
        ...createMockMessage('msg-1'),
        sendStatus: 'pending',
      };
      useChatStore.getState().addAgentMessage('session-1', message);

      useChatStore.getState().setMessageSendStatus('msg-1', 'sent');

      expect(useChatStore.getState().agentMessages['session-1']?.[0]?.sendStatus).toBe('sent');
    });
  });

  describe('pending acks', () => {
    it('should add pending ack', () => {
      useChatStore.getState().addPendingAck('msg-1');

      expect(useChatStore.getState().pendingMessageAcks.has('msg-1')).toBe(true);
    });

    it('should remove pending ack', () => {
      useChatStore.getState().addPendingAck('msg-1');
      useChatStore.getState().addPendingAck('msg-2');

      useChatStore.getState().removePendingAck('msg-1');

      expect(useChatStore.getState().pendingMessageAcks.has('msg-1')).toBe(false);
      expect(useChatStore.getState().pendingMessageAcks.has('msg-2')).toBe(true);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      useChatStore.getState().addSupervisorMessage(createMockMessage('msg-1'));
      useChatStore.getState().addAgentMessage('session-1', createMockMessage('msg-2'));
      useChatStore.getState().setSupervisorIsLoading(true);
      useChatStore.getState().addPendingAck('msg-1');

      useChatStore.getState().reset();

      const state = useChatStore.getState();
      expect(state.supervisorMessages).toEqual([]);
      expect(state.agentMessages).toEqual({});
      expect(state.supervisorIsLoading).toBe(false);
      expect(state.pendingMessageAcks.size).toBe(0);
    });
  });
});
