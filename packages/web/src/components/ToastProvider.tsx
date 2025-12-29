// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { ToastContainer, useToasts, toastManager } from '@/components/ui/toast';

export function ToastProvider() {
  const toasts = useToasts();

  return (
    <ToastContainer
      toasts={toasts}
      onDismiss={(id) => toastManager.dismiss(id)}
    />
  );
}
