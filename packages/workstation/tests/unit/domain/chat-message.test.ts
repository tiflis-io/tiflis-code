/**
 * @file chat-message.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license MIT
 */

import { describe, it, expect } from 'vitest';
import {
  createUserMessage,
  createAssistantMessage,
  createToolMessage,
  createSystemMessage,
  createErrorMessage,
  createCompletionMessage,
  createCancellationMessage,
} from '../../../src/domain/value-objects/chat-message.js';

describe('ChatMessage', () => {
  describe('createUserMessage', () => {
    it('should create a user message with correct type', () => {
      const message = createUserMessage('Hello, world!');

      expect(message.type).toBe('user');
      expect(message.content).toBe('Hello, world!');
      expect(message.id).toBeTypeOf('string');
      expect(message.id.length).toBeGreaterThan(0);
      expect(message.timestamp).toBeTypeOf('number');
    });
  });

  describe('createAssistantMessage', () => {
    it('should create an assistant message', () => {
      const message = createAssistantMessage('I can help you with that.');

      expect(message.type).toBe('assistant');
      expect(message.content).toBe('I can help you with that.');
    });

    it('should include metadata when provided', () => {
      const message = createAssistantMessage('Response', { model: 'gpt-4' });

      expect(message.metadata).toEqual({ model: 'gpt-4' });
    });
  });

  describe('createToolMessage', () => {
    it('should create a tool message with metadata', () => {
      const message = createToolMessage('file_read', { path: '/test' });

      expect(message.type).toBe('tool');
      expect(message.content).toContain('Tool: file_read');
      expect(message.metadata).toMatchObject({
        toolName: 'file_read',
        toolInput: { path: '/test' },
      });
    });

    it('should include tool output in content and metadata', () => {
      const message = createToolMessage('exec', { cmd: 'ls' }, { files: ['a.txt'] });

      expect(message.content).toContain('Output:');
      expect(message.metadata).toMatchObject({
        toolName: 'exec',
        toolInput: { cmd: 'ls' },
        toolOutput: { files: ['a.txt'] },
      });
    });
  });

  describe('createSystemMessage', () => {
    it('should create a system message', () => {
      const message = createSystemMessage('System initialized');

      expect(message.type).toBe('system');
      expect(message.content).toBe('System initialized');
    });

    it('should include metadata when provided', () => {
      const message = createSystemMessage('Context cleared', { contextCleared: true });

      expect(message.metadata).toEqual({ contextCleared: true });
    });
  });

  describe('createErrorMessage', () => {
    it('should create an error message', () => {
      const message = createErrorMessage('Something went wrong');

      expect(message.type).toBe('error');
      expect(message.content).toBe('Something went wrong');
    });

    it('should include error metadata', () => {
      const message = createErrorMessage('Error', {
        errorCode: 'E001',
        stackTrace: 'at test.js:1',
      });

      expect(message.metadata).toEqual({
        errorCode: 'E001',
        stackTrace: 'at test.js:1',
      });
    });
  });

  describe('createCompletionMessage', () => {
    it('should create a completion message', () => {
      const message = createCompletionMessage();

      expect(message.type).toBe('system');
      expect(message.content).toBe('Command completed');
      expect(message.metadata).toEqual({ completion: true });
    });
  });

  describe('createCancellationMessage', () => {
    it('should create a cancellation message', () => {
      const message = createCancellationMessage();

      expect(message.type).toBe('system');
      expect(message.content).toBe('Command cancelled by user');
      expect(message.metadata).toEqual({ completion: true });
    });
  });
});
