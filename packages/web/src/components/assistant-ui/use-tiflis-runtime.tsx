// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useTiflisRuntime } from "./tiflis-runtime";

export interface TiflisRuntimeOptions {
  sessionId?: string;
}

export function useTiflisAssistantRuntime({ sessionId = "supervisor" }: TiflisRuntimeOptions = {}): unknown {
  const _runtime = useTiflisRuntime(sessionId);

  // Simple runtime object that assistant-ui can use
  const runtime = {
    // We'll implement the actual message sending through the Thread component's callbacks
    // For now, just return the runtime object
    ..._runtime,
  };

  return runtime;
}