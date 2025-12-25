// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import type { SVGProps, ImgHTMLAttributes } from 'react';
import { useTheme } from '@/components/theme-provider';

type IconProps = SVGProps<SVGSVGElement>;
type ImageIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'> & {
  className?: string;
};

// Tiflis Code logo icon
export function TiflisLogoIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      {...props}
    >
      <defs>
        <linearGradient id="tiflis-accent" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#2E5AA6"/>
          <stop offset="100%" stopColor="#6F4ABF"/>
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="12" fill="#111"/>
      <path d="M 14 20 L 10 26 L 10 42 L 14 48" fill="none" stroke="#2E5AA6" strokeWidth="2.6" strokeLinecap="round"/>
      <path d="M 50 20 L 54 26 L 54 42 L 50 48" fill="none" stroke="#6F4ABF" strokeWidth="2.6" strokeLinecap="round"/>
      <text x="14" y="46" fontFamily="monospace" fontSize="23" fill="url(#tiflis-accent)">›</text>
      <text x="32" y="47" textAnchor="middle" fontFamily="system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif" fontSize="47" fontWeight="500" fill="#fff">t</text>
    </svg>
  );
}

// Supervisor icon - uses Tiflis logo
export function SupervisorIcon(props: IconProps) {
  return <TiflisLogoIcon {...props} />;
}

// Claude Code icon - official Claude Code logo from iOS assets
export function ClaudeIcon({ className, ...props }: ImageIconProps) {
  return (
    <img
      src="/icons/claude-logo.png"
      alt="Claude Code"
      className={className}
      {...props}
    />
  );
}

// OpenCode icon - changes based on theme (light/dark)
export function OpenCodeIcon({ className, ...props }: ImageIconProps) {
  const { resolvedTheme } = useTheme();
  // In dark mode, use the light logo (visible on dark background)
  // In light mode, use the dark logo (visible on light background)
  const logoSrc = resolvedTheme === 'dark'
    ? '/icons/opencode-logo-light.png'
    : '/icons/opencode-logo-dark.png';

  return (
    <img
      src={logoSrc}
      alt="OpenCode"
      className={className}
      {...props}
    />
  );
}

// Cursor icon - official Cursor logo from iOS assets
export function CursorIcon({ className, ...props }: ImageIconProps) {
  return (
    <img
      src="/icons/cursor-logo.png"
      alt="Cursor"
      className={className}
      {...props}
    />
  );
}

// Terminal icon - for terminal sessions
export function TerminalIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9l3 3-3 3" />
      <path d="M13 15h4" />
    </svg>
  );
}

// Generic Agent icon - for custom/alias agents
export function AgentIcon(props: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="12" cy="10" r="3" />
      <path d="M7 20v-1a5 5 0 0 1 10 0v1" />
    </svg>
  );
}
