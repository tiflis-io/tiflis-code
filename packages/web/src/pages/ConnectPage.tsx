// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { QRScanner } from '@/components/connect/QRScanner';
import { useWebSocket } from '@/hooks/useWebSocket';
import { parseMagicLink } from '@/lib/utils';
import { TiflisLogoIcon } from '@/components/icons';
import { QrCode, Link, Loader2 } from 'lucide-react';

export function ConnectPage() {
  const [magicLink, setMagicLink] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showQRScanner, setShowQRScanner] = useState(false);

  const { connect } = useWebSocket();

  const handleConnect = useCallback(
    async (linkOrData?: string) => {
      setError(null);
      const linkToUse = linkOrData ?? magicLink.trim();
      const parsed = parseMagicLink(linkToUse);

      if (!parsed) {
        setError('Invalid magic link format');
        return;
      }

      setIsConnecting(true);

      try {
        await connect({
          tunnelId: parsed.tunnelId,
          tunnelUrl: parsed.url,
          authKey: parsed.key,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Connection failed');
        setIsConnecting(false);
      }
    },
    [connect, magicLink]
  );

  const handleQRScan = useCallback(
    (data: string) => {
      // QR code contains the magic link
      setShowQRScanner(false);
      setMagicLink(data);
      handleConnect(data);
    },
    [handleConnect]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConnect();
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 w-16 h-16 rounded-lg overflow-hidden">
            <TiflisLogoIcon className="w-16 h-16" />
          </div>
          <CardTitle className="text-2xl">Tiflis Code</CardTitle>
          <CardDescription>
            Connect to your workstation to control AI agents remotely
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!showQRScanner ? (
            <>
              <div className="space-y-2">
                <Input
                  placeholder="Paste magic link here..."
                  value={magicLink}
                  onChange={(e) => setMagicLink(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isConnecting}
                />
                {error && (
                  <p className="text-sm text-destructive">{error}</p>
                )}
              </div>

              <Button
                className="w-full"
                onClick={() => handleConnect()}
                disabled={!magicLink.trim() || isConnecting}
              >
                {isConnecting ? (
                  <>
                    <Loader2 className="animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Link />
                    Connect
                  </>
                )}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">
                    Or
                  </span>
                </div>
              </div>

              <Button
                variant="outline"
                className="w-full"
                onClick={() => setShowQRScanner(true)}
                disabled={isConnecting}
              >
                <QrCode />
                Scan QR Code
              </Button>
            </>
          ) : (
            <QRScanner onScan={handleQRScan} onBack={() => setShowQRScanner(false)} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
