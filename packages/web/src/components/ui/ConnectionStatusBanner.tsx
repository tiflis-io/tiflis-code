// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useAppStore } from '@/store/useAppStore';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { WebSocketService } from '@/services/websocket/WebSocketService';
import type { ConnectionState } from '@/types';

interface StatusConfig {
  icon: typeof Wifi | null;
  text: string;
  className: string;
  showReconnect?: boolean;
  isCircle?: boolean;
}

const statusConfigs: Record<ConnectionState, StatusConfig> = {
  disconnected: {
    icon: WifiOff,
    text: 'Disconnected',
    className: 'bg-destructive/10 border-destructive/30 text-destructive',
    showReconnect: true,
  },
  connecting: {
    icon: Loader2,
    text: 'Connecting...',
    className: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400',
  },
  connected: {
    icon: Loader2,
    text: 'Authenticating...',
    className: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400',
  },
  authenticating: {
    icon: Loader2,
    text: 'Authenticating...',
    className: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400',
  },
  authenticated: {
    icon: Loader2,
    text: 'Verifying...',
    className: 'bg-blue-500/10 border-blue-500/30 text-blue-700 dark:text-blue-400',
  },
  verified: {
    icon: null,
    text: 'Connected',
    className: 'bg-green-500/10 border-green-500/30 text-green-700 dark:text-green-400',
    isCircle: true,
  },
  degraded: {
    icon: AlertTriangle,
    text: 'Connection unstable',
    className: 'bg-yellow-500/10 border-yellow-500/30 text-yellow-700 dark:text-yellow-400',
  },
  error: {
    icon: AlertTriangle,
    text: 'Connection error',
    className: 'bg-destructive/10 border-destructive/30 text-destructive',
    showReconnect: true,
  },
};

export function ConnectionStatusBanner() {
  const connectionState = useAppStore((state) => state.connectionState);
  const workstationOnline = useAppStore((state) => state.workstationOnline);

  // Don't show banner when fully connected and workstation is online
  if (connectionState === 'verified' && workstationOnline) {
    return null;
  }

  const config = statusConfigs[connectionState];
  const Icon = config.icon;
  const isSpinner = Icon === Loader2;

  const handleReconnect = () => {
    WebSocketService.reconnect();
  };

  // Determine the display text based on state
  let displayText = config.text;
  if (connectionState === 'verified' && !workstationOnline) {
    displayText = 'Workstation offline';
  }

  // Determine circle color based on workstation status
  const circleColor = connectionState === 'verified' && !workstationOnline 
    ? 'bg-orange-500' 
    : 'bg-green-500';

  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2 px-4 py-2 border-b text-sm',
        config.className,
        connectionState === 'verified' && !workstationOnline && 'bg-orange-500/10 border-orange-500/30 text-orange-700 dark:text-orange-400'
      )}
      role="status"
      aria-live="polite"
    >
      {config.isCircle ? (
        <span className={cn('w-2.5 h-2.5 rounded-full', circleColor)} aria-hidden="true" />
      ) : Icon ? (
        <Icon
          className={cn(
            'w-4 h-4',
            isSpinner && 'animate-spin'
          )}
          aria-hidden="true"
        />
      ) : null}
      <span>{displayText}</span>

      {config.showReconnect && (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleReconnect}
          className="h-6 px-2 ml-2"
        >
          <RefreshCw className="w-3 h-3 mr-1" aria-hidden="true" />
          Reconnect
        </Button>
      )}
    </div>
  );
}
