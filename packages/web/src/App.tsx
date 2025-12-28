// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from '@/store/useAppStore';
import { ConnectPage } from '@/pages/ConnectPage';
import { AppLayout } from '@/components/layout/AppLayout';
import { ChatPage } from '@/pages/ChatPage';
import { ChatPageWithAssistantUI } from '@/pages/ChatPageWithAssistantUI';
import { TerminalPage } from '@/pages/TerminalPage';
import { SettingsPage } from '@/pages/SettingsPage';

export function App() {
  const isAuthenticated = useAppStore((state) => state.isAuthenticated);

  return (
    <BrowserRouter>
      <Routes>
        {!isAuthenticated ? (
          <>
            <Route path="/" element={<ConnectPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        ) : (
          <>
            <Route element={<AppLayout />}>
              <Route path="/" element={<Navigate to="/chat" replace />} />
              <Route path="/chat" element={<ChatPage />} />
              <Route path="/chat/:sessionId" element={<ChatPage />} />
              <Route path="/assistant-ui" element={<ChatPageWithAssistantUI />} />
              <Route path="/assistant-ui/:sessionId" element={<ChatPageWithAssistantUI />} />
              <Route path="/terminal/:sessionId" element={<TerminalPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/chat" replace />} />
          </>
        )}
      </Routes>
    </BrowserRouter>
  );
}
