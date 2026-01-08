// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

const toastVariants = cva(
  'pointer-events-auto relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-lg border p-4 shadow-lg transition-all data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-top-full',
  {
    variants: {
      variant: {
        default: 'border bg-background text-foreground',
        success:
          'border-green-500/50 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100',
        error:
          'border-destructive/50 bg-destructive/10 text-destructive dark:bg-destructive/20',
        warning:
          'border-yellow-500/50 bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-100',
        info: 'border-blue-500/50 bg-blue-50 text-blue-900 dark:bg-blue-950 dark:text-blue-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

const iconMap = {
  default: null,
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info';
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps extends Omit<Toast, 'variant'>, VariantProps<typeof toastVariants> {
  onDismiss: (id: string) => void;
  variant?: Toast['variant'];
}

export function ToastItem({
  id,
  title,
  description,
  variant = 'default',
  action,
  onDismiss,
}: ToastProps) {
  const Icon = iconMap[variant];

  return (
    <div
      className={cn(toastVariants({ variant }))}
      role="alert"
      aria-live="polite"
      data-state="open"
    >
      <div className="flex items-start gap-3">
        {Icon && (
          <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
        )}
        <div className="flex-1 space-y-1">
          {title && <p className="text-sm font-semibold">{title}</p>}
          {description && (
            <p className="text-sm opacity-90">{description}</p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {action && (
          <button
            onClick={action.onClick}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            {action.label}
          </button>
        )}
        <button
          onClick={() => onDismiss(id)}
          className="rounded-md p-1 opacity-70 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface ToastContainerProps {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-0 right-0 z-50 flex max-h-screen w-full flex-col-reverse gap-2 p-4 sm:bottom-auto sm:right-4 sm:top-4 sm:max-w-[420px] sm:flex-col"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} {...toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

// Toast state management
type ToastListener = (toasts: Toast[]) => void;

class ToastManager {
  private toasts: Toast[] = [];
  private listeners: Set<ToastListener> = new Set();

  subscribe(listener: ToastListener): () => void {
    this.listeners.add(listener);
    listener(this.toasts);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener([...this.toasts]));
  }

  show(toast: Omit<Toast, 'id'>): string {
    const id = crypto.randomUUID();
    const newToast: Toast = { ...toast, id };
    this.toasts = [...this.toasts, newToast];
    this.notify();

    // Auto-dismiss after duration (default 5s)
    const duration = toast.duration ?? 5000;
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }

    return id;
  }

  dismiss(id: string): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  dismissAll(): void {
    this.toasts = [];
    this.notify();
  }

  // Convenience methods
  success(title: string, description?: string): string {
    return this.show({ title, description, variant: 'success' });
  }

  error(title: string, description?: string): string {
    return this.show({ title, description, variant: 'error', duration: 8000 });
  }

  warning(title: string, description?: string): string {
    return this.show({ title, description, variant: 'warning' });
  }

  info(title: string, description?: string): string {
    return this.show({ title, description, variant: 'info' });
  }
}

// eslint-disable-next-line react-refresh/only-export-components
export const toastManager = new ToastManager();

// eslint-disable-next-line react-refresh/only-export-components
export function useToasts(): Toast[] {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  React.useEffect(() => {
    return toastManager.subscribe(setToasts);
  }, []);

  return toasts;
}

// eslint-disable-next-line react-refresh/only-export-components
export const toastFunctions = {
  show: (toast: Omit<Toast, 'id'>) => toastManager.show(toast),
  success: (title: string, description?: string) =>
    toastManager.success(title, description),
  error: (title: string, description?: string) =>
    toastManager.error(title, description),
  warning: (title: string, description?: string) =>
    toastManager.warning(title, description),
  info: (title: string, description?: string) =>
    toastManager.info(title, description),
  dismiss: (id: string) => toastManager.dismiss(id),
  dismissAll: () => toastManager.dismissAll(),
};
