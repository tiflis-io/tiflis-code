// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { FC } from "react";

export const Thread: FC = () => {
  return (
    <div className="flex h-full flex-col bg-background">
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center max-w-md">
          <h3 className="text-lg font-medium mb-2">Assistant UI Components</h3>
          <p className="text-sm mb-4">
            The assistant-ui components are installed but not yet fully integrated. 
            This includes Thread, Message, Composer, and other modern chat components.
          </p>
          <div className="space-y-2 text-xs">
            <p>✅ Dependencies installed (@assistant-ui/react, @assistant-ui/react-markdown)</p>
            <p>✅ Core UI components ready (Thread, ThreadList, ToolFallback)</p>
            <p>✅ shadcn/ui components set up (Button, Tooltip, Avatar, Skeleton, Dialog)</p>
            <p>🔄 Runtime integration in progress</p>
            <p>🔄 Message format conversion in progress</p>
            <p>🔄 WebSocket bridge being implemented</p>
          </div>
        </div>
      </div>
    </div>
  );
};