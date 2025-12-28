// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { FC, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ChevronDownIcon, ChevronRightIcon, CopyIcon } from "lucide-react";

interface ToolFallbackProps {
  toolName?: string;
  args?: Record<string, unknown>;
  result?: React.ReactNode;
  className?: string;
}

export const ToolFallback: FC<ToolFallbackProps> = ({
  toolName = "Tool",
  args = {},
  result,
  className,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
    }
  };

  return (
    <div className={cn("border rounded-lg bg-muted/50", className)}>
      <div className="flex items-center justify-between">
        <button
          className="flex items-center flex-1 p-3 text-left hover:bg-muted/80 transition-colors"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? (
            <ChevronDownIcon className="h-4 w-4 mr-2" />
          ) : (
            <ChevronRightIcon className="h-4 w-4 mr-2" />
          )}
          <span className="font-medium">{toolName}</span>
        </button>
        
        {isExpanded && Object.keys(args).length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleCopy(JSON.stringify(args, null, 2))}
            className="mr-2"
          >
            <CopyIcon className="h-3 w-3" />
          </Button>
        )}
      </div>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          {Object.keys(args).length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-1">Arguments:</h4>
              <pre className="text-xs bg-background p-2 rounded border overflow-x-auto">
                {JSON.stringify(args, null, 2)}
              </pre>
            </div>
          )}

          {result && (
            <div>
              <h4 className="text-sm font-medium mb-1">Result:</h4>
              <pre className="text-xs bg-background p-2 rounded border overflow-x-auto max-h-40 overflow-y-auto">
                {String(typeof result === 'string' ? result : JSON.stringify(result, null, 2))}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};