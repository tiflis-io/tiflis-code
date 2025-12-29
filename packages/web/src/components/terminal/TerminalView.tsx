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

  const { sendTerminalInput, resizeTerminal, subscribeToSession } = useWebSocket();
  const connectionState = useAppStore((state) => state.connectionState);
  const { resolvedTheme } = useTheme();

  const isConnected = connectionState === 'verified' || connectionState === 'authenticated';

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

    // Handle user input
    terminal.onData((data) => {
      if (isConnected) {
        sendTerminalInput(sessionId, data);
      }
    });

    // Subscribe to session for terminal output
    subscribeToSession(sessionId);

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
    // Note: terminalTheme is intentionally excluded - we don't want to reinitialize
    // the terminal on theme changes. Theme updates are handled by a separate effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, isConnected, sendTerminalInput, subscribeToSession]);

  // Handle resize with debouncing
  const handleResize = useCallback(() => {
    if (resizeTimeoutRef.current !== null) {
      clearTimeout(resizeTimeoutRef.current);
    }
    resizeTimeoutRef.current = setTimeout(() => {
      resizeTimeoutRef.current = null;
      if (fitAddonRef.current && terminalRef.current && isConnected) {
        fitAddonRef.current.fit();
        const { cols, rows } = terminalRef.current;
        resizeTerminal(sessionId, cols, rows);
      }
    }, 50); // 50ms debounce
  }, [sessionId, isConnected, resizeTerminal]);

  // Setup resize observer
  useEffect(() => {
    if (!containerRef.current || !isInitialized) return;

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(containerRef.current);

    // Also handle window resize
    window.addEventListener('resize', handleResize);

    // Initial resize
    handleResize();

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      if (resizeTimeoutRef.current !== null) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, [handleResize, isInitialized]);

  // Update terminal theme when app theme changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = terminalTheme;
    }
  }, [terminalTheme]);

  // Write terminal output from WebSocket
  useEffect(() => {
    if (!terminalRef.current) return;

    const handleTerminalOutput = (event: CustomEvent<{ sessionId: string; data: string }>) => {
      if (event.detail.sessionId === sessionId && terminalRef.current) {
        terminalRef.current.write(event.detail.data);
      }
    };

    window.addEventListener('terminal-output', handleTerminalOutput as EventListener);

    return () => {
      window.removeEventListener('terminal-output', handleTerminalOutput as EventListener);
    };
  }, [sessionId]);

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
