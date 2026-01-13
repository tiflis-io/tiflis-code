// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAppStore } from '@/store/useAppStore';
import { useTheme } from '@/components/theme-provider';
import type { ITheme } from '@xterm/xterm';

// Terminal themes for light and dark modes
const darkTheme: ITheme = {
  background: '#1a1a1a',
  foreground: '#d4d4d4',
  cursor: '#d4d4d4',
  cursorAccent: '#1a1a1a',
  selectionBackground: '#3a3a3a',
  black: '#1a1a1a',
  red: '#f44747',
  green: '#6a9955',
  yellow: '#dcdcaa',
  blue: '#569cd6',
  magenta: '#c586c0',
  cyan: '#4ec9b0',
  white: '#d4d4d4',
  brightBlack: '#808080',
  brightRed: '#f44747',
  brightGreen: '#6a9955',
  brightYellow: '#dcdcaa',
  brightBlue: '#569cd6',
  brightMagenta: '#c586c0',
  brightCyan: '#4ec9b0',
  brightWhite: '#ffffff',
};

const lightTheme: ITheme = {
  background: '#ffffff',
  foreground: '#383a42',
  cursor: '#383a42',
  cursorAccent: '#ffffff',
  selectionBackground: '#d7d7d7',
  black: '#383a42',
  red: '#e45649',
  green: '#50a14f',
  yellow: '#c18401',
  blue: '#4078f2',
  magenta: '#a626a4',
  cyan: '#0184bc',
  white: '#fafafa',
  brightBlack: '#4f525e',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff',
};

interface TerminalViewProps {
  sessionId: string;
}

export function TerminalView({ sessionId }: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);

  // Resize debounce ref
  const resizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track last sent dimensions to avoid sending duplicate resize messages
  const lastSentDimensionsRef = useRef<{ cols: number; rows: number } | null>(null);
  // Track last observed container size to detect actual changes
  const lastContainerSizeRef = useRef<{ width: number; height: number } | null>(null);
  // Flag to prevent ResizeObserver from triggering during our own fit() call
  const isFittingRef = useRef(false);
  // Cooldown timestamp - prevent rapid-fire resizes
  const lastResizeTimeRef = useRef<number>(0);

  // Write batching refs - batch terminal writes to reduce redraws
  // Uses requestAnimationFrame to sync with display refresh (60fps)
  const pendingWriteDataRef = useRef<string>('');
  const writeRafIdRef = useRef<number | null>(null);

  const { sendTerminalInput, resizeTerminal, subscribeToSession, requestTerminalReplay } = useWebSocket();
  const { resolvedTheme } = useTheme();
  const connectionState = useAppStore((state) => state.connectionState);
  const isConnected = connectionState === 'verified' || connectionState === 'authenticated';
  const wasConnectedRef = useRef(false);
  const hasSubscribedRef = useRef(false);

  // Memoize the theme to avoid recalculating on every render
  const terminalTheme = useMemo(
    () => (resolvedTheme === 'dark' ? darkTheme : lightTheme),
    [resolvedTheme]
  );

  // Initialize terminal
  useEffect(() => {
    if (!containerRef.current || terminalRef.current) return;

    const terminal = new Terminal({
      // Cursor
      cursorBlink: true,
      cursorStyle: 'block',
      cursorInactiveStyle: 'outline', // Visible cursor when terminal loses focus

      // Font
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',

      // Theme
      theme: terminalTheme,

      // Scrolling - optimized for TUI apps (htop, vim, etc.)
      scrollback: 10000,
      scrollOnUserInput: true, // Auto-scroll to bottom on keystroke
      smoothScrollDuration: 0, // Disable smooth scrolling - conflicts with TUI apps
      fastScrollModifier: 'alt', // Hold Alt for fast scrolling
      fastScrollSensitivity: 5, // 5x speed when fast scrolling

      // Input handling
      convertEol: true,
      macOptionIsMeta: true, // Option key as meta on Mac
      macOptionClickForcesSelection: true, // Option+click for selection on Mac
      rightClickSelectsWord: true, // Standard macOS behavior
      altClickMovesCursor: true, // Alt+click to move cursor (readline)
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);

    terminal.open(containerRef.current);
    fitAddon.fit();

    // Note: WebGL addon (@xterm/addon-webgl) is available but disabled.
    // It causes zoom/magnification issues with TUI apps (htop, top, vim)
    // that use alternate screen buffer mode. Canvas renderer works correctly.

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    setIsInitialized(true);

    // Handle user input - check connection state dynamically
    terminal.onData((data) => {
      const currentState = useAppStore.getState().connectionState;
      const connected = currentState === 'verified' || currentState === 'authenticated';
      if (connected) {
        sendTerminalInput(sessionId, data);
      }
    });

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      hasSubscribedRef.current = false;
    };
    // Note: terminalTheme is intentionally excluded - we don't want to reinitialize
    // the terminal on theme changes. Theme updates are handled by a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, sendTerminalInput]);

  // Subscribe to terminal session on connect and after reconnection
  useEffect(() => {
    if (!isInitialized || !isConnected) return;

    const needsSubscription = !hasSubscribedRef.current || 
      (wasConnectedRef.current === false && isConnected);

    if (needsSubscription) {
      hasSubscribedRef.current = true;
      subscribeToSession(sessionId);
      
      setTimeout(() => {
        requestTerminalReplay(sessionId, 0, 500);
      }, 100);
    }

    wasConnectedRef.current = isConnected;
  }, [isInitialized, isConnected, sessionId, subscribeToSession, requestTerminalReplay]);

  // Reset subscription tracking on disconnect
  useEffect(() => {
    if (connectionState === 'disconnected' || connectionState === 'error') {
      hasSubscribedRef.current = false;
      wasConnectedRef.current = false;
    }
  }, [connectionState]);

  // Queue terminal data for batched writing
  // Uses requestAnimationFrame to batch multiple writes into a single render
  const queueTerminalWrite = useCallback((data: string) => {
    pendingWriteDataRef.current += data;

    // Schedule a write on the next animation frame if not already scheduled
    if (writeRafIdRef.current === null) {
      writeRafIdRef.current = requestAnimationFrame(() => {
        if (terminalRef.current && pendingWriteDataRef.current) {
          terminalRef.current.write(pendingWriteDataRef.current);
        }
        pendingWriteDataRef.current = '';
        writeRafIdRef.current = null;
      });
    }
  }, []);

  // Perform the actual fit and resize - extracted to avoid recreating on every render
  const performFitAndResize = useCallback(() => {
    if (!fitAddonRef.current || !terminalRef.current || !containerRef.current) return;

    // Cooldown check - don't resize more than once per 500ms
    const now = Date.now();
    if (now - lastResizeTimeRef.current < 500) {
      return;
    }

    // Check if container size actually changed (ignore sub-pixel differences)
    const rect = containerRef.current.getBoundingClientRect();
    const width = Math.floor(rect.width);
    const height = Math.floor(rect.height);

    const lastSize = lastContainerSizeRef.current;
    if (lastSize && lastSize.width === width && lastSize.height === height) {
      // Container size unchanged, skip resize
      return;
    }

    lastContainerSizeRef.current = { width, height };

    // Set fitting flag to prevent ResizeObserver from triggering again
    isFittingRef.current = true;

    try {
      // Now fit the terminal
      fitAddonRef.current.fit();

      const { cols, rows } = terminalRef.current;

      // Only send resize if terminal dimensions actually changed from what we last sent
      const lastDims = lastSentDimensionsRef.current;
      if (!lastDims || lastDims.cols !== cols || lastDims.rows !== rows) {
        lastSentDimensionsRef.current = { cols, rows };
        lastResizeTimeRef.current = now;
        resizeTerminal(sessionId, cols, rows);
      }
    } finally {
      // Reset fitting flag after a small delay to ensure ResizeObserver callbacks are processed
      // Using setTimeout instead of requestAnimationFrame for more reliable timing
      setTimeout(() => {
        isFittingRef.current = false;
      }, 50);
    }
  }, [sessionId, resizeTerminal]);

  // Setup resize observer - use refs to avoid recreating on every state change
  useEffect(() => {
    if (!containerRef.current || !isInitialized) return;

    const container = containerRef.current;

    // Debounced resize handler
    const handleResize = () => {
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current);
      }
      resizeTimeoutRef.current = setTimeout(() => {
        resizeTimeoutRef.current = null;
        // Check connection state at execution time, not closure time
        const currentState = useAppStore.getState().connectionState;
        const connected = currentState === 'verified' || currentState === 'authenticated';
        if (connected) {
          performFitAndResize();
        }
      }, 150); // 150ms debounce for stability
    };

    const resizeObserver = new ResizeObserver((entries) => {
      // Skip if we're currently fitting the terminal (to prevent infinite loop)
      if (isFittingRef.current) {
        return;
      }

      // Check if container size actually changed before triggering debounced resize
      const entry = entries[0];
      if (!entry) return;

      // Use borderBoxSize if available, otherwise fall back to contentRect
      // This ensures we're measuring consistently with getBoundingClientRect()
      let roundedWidth: number;
      let roundedHeight: number;

      if (entry.borderBoxSize && entry.borderBoxSize[0]) {
        roundedWidth = Math.floor(entry.borderBoxSize[0].inlineSize);
        roundedHeight = Math.floor(entry.borderBoxSize[0].blockSize);
      } else {
        // Fallback to contentRect (excludes padding/border)
        roundedWidth = Math.floor(entry.contentRect.width);
        roundedHeight = Math.floor(entry.contentRect.height);
      }

      // Skip if size is zero (element not visible)
      if (roundedWidth === 0 || roundedHeight === 0) return;

      const lastSize = lastContainerSizeRef.current;
      if (lastSize && lastSize.width === roundedWidth && lastSize.height === roundedHeight) {
        // Container size unchanged, skip resize entirely
        return;
      }

      // Note: Don't update lastContainerSizeRef here - let performFitAndResize do it
      // This ensures we have a consistent state between container size and terminal dimensions
      handleResize();
    });

    // Observe using border-box to match getBoundingClientRect() behavior
    resizeObserver.observe(container, { box: 'border-box' });

    // Also handle window resize
    const windowResizeHandler = () => handleResize();
    window.addEventListener('resize', windowResizeHandler);

    // Initial resize - delay to ensure layout is stable
    const initialResizeTimeout = setTimeout(handleResize, 50);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', windowResizeHandler);
      clearTimeout(initialResizeTimeout);
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [isInitialized, performFitAndResize]);

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = terminalTheme;
    }
  }, [terminalTheme]);

  // Write terminal output from WebSocket using batched writes
  useEffect(() => {
    if (!terminalRef.current) return;

    const handleTerminalOutput = (event: CustomEvent<{ sessionId: string; data: string }>) => {
      if (event.detail.sessionId === sessionId) {
        // Use batched write to reduce redraws and improve performance
        queueTerminalWrite(event.detail.data);
      }
    };

    window.addEventListener('terminal-output', handleTerminalOutput as EventListener);

    return () => {
      window.removeEventListener('terminal-output', handleTerminalOutput as EventListener);
      // Cancel any pending animation frame on cleanup
      if (writeRafIdRef.current !== null) {
        cancelAnimationFrame(writeRafIdRef.current);
        writeRafIdRef.current = null;
      }
      // Flush any pending data before cleanup
      if (terminalRef.current && pendingWriteDataRef.current) {
        terminalRef.current.write(pendingWriteDataRef.current);
        pendingWriteDataRef.current = '';
      }
    };
  }, [sessionId, queueTerminalWrite]);

  // Expose clear function via custom event for external control (e.g., from header menu)
  useEffect(() => {
    const handleClearTerminal = (event: CustomEvent<{ sessionId: string }>) => {
      if (event.detail.sessionId === sessionId && terminalRef.current) {
        terminalRef.current.clear();
      }
    };

    window.addEventListener('terminal-clear', handleClearTerminal as EventListener);

    return () => {
      window.removeEventListener('terminal-clear', handleClearTerminal as EventListener);
    };
  }, [sessionId]);

  const containerBg = resolvedTheme === 'dark' ? 'bg-[#1a1a1a]' : 'bg-white';

  return (
    <div className={`flex flex-col h-full ${containerBg}`}>
      <div ref={containerRef} className="flex-1 p-2" />
    </div>
  );
}
