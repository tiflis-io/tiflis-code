// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

// Simplified placeholder with correct exports
export { Thread } from './thread';
export { ThreadList } from './thread-list';

// Runtime components will be implemented when types are resolved
export const useTiflisRuntime = () => ({
  messages: [],
  isLoading: false,
  isRunning: false,
  append: async () => {},
  cancel: () => {},
  restart: () => {},
  isReady: true,
});

export const useTiflisAssistantRuntime = () => ({});