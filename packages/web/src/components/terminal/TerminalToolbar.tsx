// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { Button } from '@/components/ui/button';
import { Terminal, Trash2 } from 'lucide-react';

interface TerminalToolbarProps {
  sessionId: string;
  title: string;
  subtitle?: string;
  onClear: () => void;
}

export function TerminalToolbar({
  title,
  subtitle,
  onClear,
}: TerminalToolbarProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2 bg-[#252525] border-b border-[#333]">
      <div className="flex items-center gap-3">
        <Terminal className="w-4 h-4 text-green-400" />
        <div>
          <h2 className="text-sm font-medium text-white">{title}</h2>
          {subtitle && (
            <p className="text-xs text-gray-400">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={onClear}
          className="h-8 w-8 text-gray-400 hover:text-white hover:bg-[#333]"
          title="Clear terminal"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
