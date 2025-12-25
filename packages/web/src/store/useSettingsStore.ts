// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Sidebar width constraints
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 320;
const SIDEBAR_COLLAPSED_WIDTH = 64;

interface SettingsState {
  // Voice settings
  ttsEnabled: boolean;
  sttLanguage: string;

  // UI settings
  sidebarCollapsed: boolean;
  sidebarWidth: number;

  // Actions
  setTtsEnabled: (enabled: boolean) => void;
  setSttLanguage: (language: string) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setSidebarWidth: (width: number) => void;
  toggleSidebar: () => void;

  // Reset
  reset: () => void;
}

export { SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_DEFAULT_WIDTH, SIDEBAR_COLLAPSED_WIDTH };

const initialState = {
  ttsEnabled: true,
  sttLanguage: 'en',
  sidebarCollapsed: false,
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...initialState,

      setTtsEnabled: (ttsEnabled) => set({ ttsEnabled }),
      setSttLanguage: (sttLanguage) => set({ sttLanguage }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setSidebarWidth: (width) =>
        set({ sidebarWidth: Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, width)) }),
      toggleSidebar: () =>
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      reset: () => set(initialState),
    }),
    {
      name: 'tiflis-settings',
    }
  )
);
