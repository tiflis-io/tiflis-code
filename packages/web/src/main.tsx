// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ThemeProvider } from './components/theme-provider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ToastProvider } from './components/ToastProvider';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <App />
        <ToastProvider />
      </ThemeProvider>
    </ErrorBoundary>
  </StrictMode>
);
