/**
 * @file useSettingsStore.test.ts
 * @copyright 2025 Roman Barinov <rbarinov@gmail.com>
 * @license FSL-1.1-NC
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './useSettingsStore';

describe('useSettingsStore', () => {
  beforeEach(() => {
    useSettingsStore.getState().reset();
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useSettingsStore.getState();

      expect(state.ttsEnabled).toBe(true);
      expect(state.sttLanguage).toBe('en');
      expect(state.sidebarCollapsed).toBe(false);
    });
  });

  describe('voice settings', () => {
    it('should set TTS enabled', () => {
      useSettingsStore.getState().setTtsEnabled(false);
      expect(useSettingsStore.getState().ttsEnabled).toBe(false);

      useSettingsStore.getState().setTtsEnabled(true);
      expect(useSettingsStore.getState().ttsEnabled).toBe(true);
    });

    it('should set STT language', () => {
      useSettingsStore.getState().setSttLanguage('ru');
      expect(useSettingsStore.getState().sttLanguage).toBe('ru');

      useSettingsStore.getState().setSttLanguage('de');
      expect(useSettingsStore.getState().sttLanguage).toBe('de');
    });
  });

  describe('UI settings', () => {
    it('should set sidebar collapsed', () => {
      useSettingsStore.getState().setSidebarCollapsed(true);
      expect(useSettingsStore.getState().sidebarCollapsed).toBe(true);

      useSettingsStore.getState().setSidebarCollapsed(false);
      expect(useSettingsStore.getState().sidebarCollapsed).toBe(false);
    });

    it('should toggle sidebar', () => {
      expect(useSettingsStore.getState().sidebarCollapsed).toBe(false);

      useSettingsStore.getState().toggleSidebar();
      expect(useSettingsStore.getState().sidebarCollapsed).toBe(true);

      useSettingsStore.getState().toggleSidebar();
      expect(useSettingsStore.getState().sidebarCollapsed).toBe(false);
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      useSettingsStore.getState().setTtsEnabled(false);
      useSettingsStore.getState().setSttLanguage('fr');
      useSettingsStore.getState().setSidebarCollapsed(true);

      useSettingsStore.getState().reset();

      const state = useSettingsStore.getState();
      expect(state.ttsEnabled).toBe(true);
      expect(state.sttLanguage).toBe('en');
      expect(state.sidebarCollapsed).toBe(false);
    });
  });
});
