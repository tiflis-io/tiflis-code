// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { useParams, Navigate } from 'react-router-dom';
import { TerminalView } from '@/components/terminal';

export function TerminalPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  if (!sessionId) {
    return <Navigate to="/chat" replace />;
  }

  return <TerminalView sessionId={sessionId} />;
}
