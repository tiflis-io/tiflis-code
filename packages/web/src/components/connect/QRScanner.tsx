// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useState, useCallback } from 'react';
import { Scanner, type IDetectedBarcode } from '@yudiel/react-qr-scanner';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Camera, CameraOff } from 'lucide-react';

interface QRScannerProps {
  onScan: (data: string) => void;
  onBack: () => void;
}

export function QRScanner({ onScan, onBack }: QRScannerProps) {
  const [error, setError] = useState<string | null>(null);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);

  const handleScan = useCallback(
    (detectedCodes: IDetectedBarcode[]) => {
      if (detectedCodes.length > 0) {
        const code = detectedCodes[0];
        if (code?.rawValue) {
          onScan(code.rawValue);
        }
      }
    },
    [onScan]
  );

  const handleError = useCallback((err: unknown) => {
    console.error('QR Scanner error:', err);
    if (err instanceof Error) {
      if (err.name === 'NotAllowedError') {
        setHasPermission(false);
        setError('Camera access denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device.');
      } else {
        setError(err.message);
      }
    } else {
      setError('Failed to access camera');
    }
  }, []);

  return (
    <div className="space-y-4">
      <div className="aspect-square bg-muted rounded-lg overflow-hidden relative">
        {hasPermission === false ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <CameraOff className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        ) : error ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center">
            <Camera className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-sm text-destructive">{error}</p>
          </div>
        ) : (
          <Scanner
            onScan={handleScan}
            onError={handleError}
            constraints={{
              facingMode: 'environment',
            }}
            styles={{
              container: {
                width: '100%',
                height: '100%',
              },
              video: {
                width: '100%',
                height: '100%',
                objectFit: 'cover',
              },
            }}
            components={{
              finder: true,
            }}
          />
        )}

        {/* Scan overlay */}
        {!error && hasPermission !== false && (
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute inset-8 border-2 border-primary rounded-lg opacity-50" />
            <div className="absolute inset-8 animate-pulse">
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-lg" />
            </div>
          </div>
        )}
      </div>

      <p className="text-sm text-center text-muted-foreground">
        Point your camera at the QR code shown in your workstation terminal
      </p>

      <Button variant="outline" className="w-full" onClick={onBack}>
        <ArrowLeft className="w-4 h-4" />
        Back to Magic Link
      </Button>
    </div>
  );
}
