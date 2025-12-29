// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  return crypto.randomUUID();
}

interface MagicLinkData {
  tunnelId: string;
  url: string;
  key: string;
}

/**
 * Validates that the magic link data contains required fields with proper formats
 */
function validateMagicLinkData(data: unknown): MagicLinkData | null {
  if (!data || typeof data !== 'object') {
    return null;
  }

  const obj = data as Record<string, unknown>;

  // Validate required fields exist and are strings
  if (
    typeof obj.tunnel_id !== 'string' ||
    typeof obj.url !== 'string' ||
    typeof obj.key !== 'string'
  ) {
    return null;
  }

  const tunnelId = obj.tunnel_id.trim();
  const url = obj.url.trim();
  const key = obj.key.trim();

  // Validate non-empty
  if (!tunnelId || !url || !key) {
    return null;
  }

  // Validate tunnel_id format (UUID-like or alphanumeric)
  if (!/^[a-zA-Z0-9-_]+$/.test(tunnelId)) {
    return null;
  }

  // Validate and normalize URL format
  let normalizedUrl = url;
  try {
    const parsedUrl = new URL(url);
    // Auto-convert HTTP(S) to WS(S) for convenience
    if (parsedUrl.protocol === 'http:') {
      normalizedUrl = 'ws:' + url.slice(5);
    } else if (parsedUrl.protocol === 'https:') {
      normalizedUrl = 'wss:' + url.slice(6);
    } else if (parsedUrl.protocol !== 'ws:' && parsedUrl.protocol !== 'wss:') {
      return null;
    }
  } catch {
    return null;
  }

  // Validate key is non-empty (length requirements enforced by server)
  if (key.length < 1) {
    return null;
  }

  return { tunnelId, url: normalizedUrl, key };
}

export function parseMagicLink(link: string): MagicLinkData | null {
  if (!link || typeof link !== 'string') {
    return null;
  }

  const trimmedLink = link.trim();
  if (!trimmedLink) {
    return null;
  }

  try {
    if (trimmedLink.startsWith('{')) {
      const decoded = JSON.parse(trimmedLink);
      return validateMagicLinkData(decoded);
    }

    // Direct string parsing avoids URL API inconsistencies across browsers for custom schemes
    const prefix = 'tiflis://connect?data=';
    const lowerLink = trimmedLink.toLowerCase();
    if (lowerLink.startsWith(prefix)) {
      const dataParamIndex = lowerLink.indexOf('data=');
      if (dataParamIndex === -1) {
        return null;
      }
      let data = trimmedLink.slice(dataParamIndex + 5).trim();
      
      try {
        data = decodeURIComponent(data);
      } catch {
        // Intentional: fallback to raw data
      }
      
      // Base64: standard (+/=) and URL-safe (-_) variants
      if (!data || !/^[A-Za-z0-9+/=_-]+$/.test(data)) {
        return null;
      }
      
      const standardBase64 = data.replace(/-/g, '+').replace(/_/g, '/');
      const decoded = JSON.parse(atob(standardBase64));
      return validateMagicLinkData(decoded);
    }

    try {
      const url = new URL(trimmedLink);
      if (url.protocol === 'tiflis:') {
        const data = url.searchParams.get('data');
        if (data && /^[A-Za-z0-9+/=]+$/.test(data)) {
          const decoded = JSON.parse(atob(data));
          return validateMagicLinkData(decoded);
        }
      }
    } catch {
      // URL API fallback failed
    }

    return null;
  } catch {
    return null;
  }
}

export function formatRelativePath(
  absolutePath: string,
  workspacesRoot: string
): string {
  if (!workspacesRoot || !absolutePath.startsWith(workspacesRoot)) {
    // Fallback: replace home directory with ~
    const home = '/Users/';
    if (absolutePath.includes(home)) {
      const parts = absolutePath.split(home);
      if (parts[1]) {
        const userAndPath = parts[1].split('/');
        userAndPath.shift(); // Remove username
        return '~/' + userAndPath.join('/');
      }
    }
    return absolutePath;
  }

  return absolutePath.slice(workspacesRoot.length + 1);
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
