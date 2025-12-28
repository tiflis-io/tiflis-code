// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { FC } from "react";
import { cn } from "@/lib/utils";

interface ThreadListProps {
  className?: string;
}

export const ThreadList: FC<ThreadListProps> = ({ className }) => {
  // Placeholder for thread list - will be implemented with state integration
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm text-muted-foreground">Thread list will be implemented here</p>
      <p className="text-xs text-muted-foreground">
        This will show active sessions with supervisor and agent history
      </p>
    </div>
  );
};