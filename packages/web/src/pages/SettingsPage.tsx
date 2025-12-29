// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useAppStore } from '@/store/useAppStore';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useTheme } from '@/components/theme-provider';
import { Trash2, Monitor, Server, Info, Wifi, WifiOff, Sun, Moon, Laptop, Volume2 } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export function SettingsPage() {
  const credentials = useAppStore((state) => state.credentials);
  const workstationInfo = useAppStore((state) => state.workstationInfo);
  const tunnelInfo = useAppStore((state) => state.tunnelInfo);
  const connectionState = useAppStore((state) => state.connectionState);
  const { disconnectAndForget } = useWebSocket();
  const resetSettings = useSettingsStore((state) => state.reset);
  const ttsEnabled = useSettingsStore((state) => state.ttsEnabled);
  const setTtsEnabled = useSettingsStore((state) => state.setTtsEnabled);
  const { theme, setTheme } = useTheme();
  const [isForgetDialogOpen, setIsForgetDialogOpen] = useState(false);

  const handleDisconnectAndForget = async () => {
    await disconnectAndForget();
    resetSettings();
    setIsForgetDialogOpen(false);
  };

  const isConnected = connectionState === 'verified' || connectionState === 'authenticated';

  const getConnectionStatusColor = () => {
    switch (connectionState) {
      case 'verified':
        return 'bg-green-500';
      case 'authenticated':
        return 'bg-yellow-500';
      case 'connecting':
        return 'bg-blue-500 animate-pulse';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getConnectionStatusText = () => {
    switch (connectionState) {
      case 'verified':
        return 'Connected to Workstation';
      case 'authenticated':
        return 'Connected to Tunnel';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Disconnected';
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="max-w-2xl mx-auto space-y-6 pb-8">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Appearance */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-muted-foreground" />
              <CardTitle>Appearance</CardTitle>
            </div>
            <CardDescription>
              Customize the look and feel of the application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Theme</p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className={cn(
                    'flex-1 gap-2',
                    theme === 'light' && 'border-primary bg-primary/10'
                  )}
                  onClick={() => setTheme('light')}
                >
                  <Sun className="w-4 h-4" />
                  Light
                </Button>
                <Button
                  variant="outline"
                  className={cn(
                    'flex-1 gap-2',
                    theme === 'dark' && 'border-primary bg-primary/10'
                  )}
                  onClick={() => setTheme('dark')}
                >
                  <Moon className="w-4 h-4" />
                  Dark
                </Button>
                <Button
                  variant="outline"
                  className={cn(
                    'flex-1 gap-2',
                    theme === 'system' && 'border-primary bg-primary/10'
                  )}
                  onClick={() => setTheme('system')}
                >
                  <Laptop className="w-4 h-4" />
                  System
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Voice */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Volume2 className="w-5 h-5 text-muted-foreground" />
              <CardTitle>Voice</CardTitle>
            </div>
            <CardDescription>
              Configure text-to-speech and voice input settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="tts-toggle" className="text-sm font-medium">
                  Auto-play TTS responses
                </Label>
                <p className="text-sm text-muted-foreground">
                  Automatically play audio when receiving voice responses
                </p>
              </div>
              <Switch
                id="tts-toggle"
                checked={ttsEnabled}
                onCheckedChange={setTtsEnabled}
              />
            </div>
          </CardContent>
        </Card>

        {/* Connection Status */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="w-5 h-5 text-green-500" />
              ) : (
                <WifiOff className="w-5 h-5 text-muted-foreground" />
              )}
              <CardTitle>Connection</CardTitle>
            </div>
            <CardDescription>
              Current connection status and information
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
              <div className={`w-3 h-3 rounded-full ${getConnectionStatusColor()}`} />
              <span className="font-medium">{getConnectionStatusText()}</span>
            </div>

            {credentials && (
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Info className="w-4 h-4" />
                  <span>Connection Details</span>
                </div>
                <div className="grid gap-2 pl-6">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tunnel ID:</span>
                    <span className="font-mono text-xs">{credentials.tunnelId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tunnel URL:</span>
                    <span className="font-mono text-xs truncate max-w-[200px]">
                      {credentials.tunnelUrl}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Device ID:</span>
                    <span className="font-mono text-xs">{credentials.deviceId}</span>
                  </div>
                </div>
              </div>
            )}

            {workstationInfo && (
              <div className="space-y-3 text-sm border-t pt-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Monitor className="w-4 h-4" />
                  <span>Workstation</span>
                </div>
                <div className="grid gap-2 pl-6">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name:</span>
                    <span>{workstationInfo.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Version:</span>
                    <span className="font-mono text-xs">{workstationInfo.version}</span>
                  </div>
                  {workstationInfo.workspacesRoot && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Workspaces:</span>
                      <span className="font-mono text-xs truncate max-w-[200px]">
                        {workstationInfo.workspacesRoot}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {tunnelInfo && (
              <div className="space-y-3 text-sm border-t pt-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Server className="w-4 h-4" />
                  <span>Tunnel Server</span>
                </div>
                <div className="grid gap-2 pl-6">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Version:</span>
                    <span className="font-mono text-xs">{tunnelInfo.version}</span>
                  </div>
                  {tunnelInfo.protocolVersion && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Protocol:</span>
                      <span className="font-mono text-xs">v{tunnelInfo.protocolVersion}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* About */}
        <Card>
          <CardHeader>
            <CardTitle>About</CardTitle>
            <CardDescription>Tiflis Code Web Client</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Version:</span>
              <span className="font-mono">0.1.0</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Author:</span>
              <span>Roman Barinov</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Repository:</span>
              <a
                href="https://github.com/tiflis-io/tiflis-code"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                tiflis-io/tiflis-code
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">License:</span>
              <span>FSL-1.1-NC</span>
            </div>
          </CardContent>
        </Card>

        {/* Legal */}
        <Card>
          <CardHeader>
            <CardTitle>Legal</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Privacy Policy</span>
              <a
                href="https://github.com/tiflis-io/tiflis-code/blob/main/PRIVACY.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                View
              </a>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground">Terms of Service</span>
              <a
                href="https://github.com/tiflis-io/tiflis-code/blob/main/TERMS.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                View
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/50">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Disconnect and clear all stored data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog open={isForgetDialogOpen} onOpenChange={setIsForgetDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full">
                  <Trash2 className="w-4 h-4" />
                  Disconnect & Forget All Data
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete all stored connection data including:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Authentication keys</li>
                      <li>Tunnel connection settings</li>
                      <li>Device ID</li>
                      <li>All stored preferences</li>
                    </ul>
                    <p className="mt-2 font-medium">
                      You will need to scan a QR code or paste a magic link again to reconnect.
                    </p>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDisconnectAndForget}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Delete All Data
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
