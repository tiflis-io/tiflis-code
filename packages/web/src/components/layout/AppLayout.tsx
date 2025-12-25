// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useCallback, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MobileHeader } from './MobileHeader';
import {
  useSettingsStore,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_COLLAPSED_WIDTH,
} from '@/store/useSettingsStore';
import { cn } from '@/lib/utils';

export function AppLayout() {
  const sidebarCollapsed = useSettingsStore((state) => state.sidebarCollapsed);
  const sidebarWidth = useSettingsStore((state) => state.sidebarWidth);
  const setSidebarWidth = useSettingsStore((state) => state.setSidebarWidth);

  const [isResizing, setIsResizing] = useState(false);
  const isResizingRef = useRef(false);
  const sidebarRef = useRef<HTMLElement>(null);

  // Handle resize start
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (sidebarCollapsed) return;

      e.preventDefault();
      setIsResizing(true);
      isResizingRef.current = true;

      const handleMouseMove = (e: MouseEvent) => {
        if (!isResizingRef.current) return;

        const newWidth = e.clientX;
        if (newWidth >= SIDEBAR_MIN_WIDTH && newWidth <= SIDEBAR_MAX_WIDTH) {
          setSidebarWidth(newWidth);
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
        isResizingRef.current = false;
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    },
    [sidebarCollapsed, setSidebarWidth]
  );

  const effectiveWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Desktop Sidebar */}
      <aside
        ref={sidebarRef}
        style={{ width: effectiveWidth }}
        className={cn(
          'hidden md:flex flex-col border-r bg-card relative',
          !sidebarCollapsed && 'transition-none',
          sidebarCollapsed && 'transition-all duration-300'
        )}
      >
        <Sidebar />

        {/* Resize handle */}
        {!sidebarCollapsed && (
          <div
            className={cn(
              'absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors',
              isResizing && 'bg-primary/30'
            )}
            onMouseDown={handleMouseDown}
          />
        )}
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile Header */}
        <MobileHeader />

        {/* Page content */}
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
