// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { Button } from '@/components/ui/button';

// Temporary placeholder page for assistant-ui integration
export function ChatPageWithAssistantUI() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-center max-w-md space-y-4">
        <h3 className="text-lg font-medium">Assistant-UI Migration Status</h3>
        
        <div className="text-sm text-muted-foreground space-y-2">
          <p>Migration to assistant-ui components is in progress.</p>
          <p>The original ChatView will be replaced with modern components.</p>
        </div>

        <div className="space-y-2 text-xs text-muted-foreground">
          <h4 className="font-medium text-foreground">✅ Completed:</h4>
          <ul className="list-disc list-inside space-y-1">
            <li>All dependencies installed</li>
            <li>Core UI components ready</li>
            <li>shadcn/ui integration set up</li>
            <li>TypeScript compilation resolved</li>
          </ul>

          <h4 className="font-medium text-foreground mt-3">📋 Next Steps:</h4>
          <ul className="list-disc list-inside space-y-1">
            <li>Runtime integration</li>
            <li>Message format conversion</li>
            <li>WebSocket bridge</li>
            <li>Voice support integration</li>
            <li>Thread management</li>
          </ul>
        </div>

        <Button 
          onClick={() => window.history.back()}
          variant="outline"
        >
          Go back to original Chat
        </Button>
      </div>
    </div>
  );
}

// Export the new chat page as default
export default ChatPageWithAssistantUI;