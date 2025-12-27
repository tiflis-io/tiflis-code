// Copyright (c) 2025 Roman Barinov <rbarinov@gmail.com>
// Licensed under the FSL-1.1-NC.

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });

    // Log error to console in development
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught an error:', error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="flex min-h-screen items-center justify-center bg-background p-4"
          role="alert"
          aria-live="assertive"
        >
          <div className="w-full max-w-md space-y-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle
                className="h-8 w-8 text-destructive"
                aria-hidden="true"
              />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">
                Something went wrong
              </h1>
              <p className="text-muted-foreground">
                An unexpected error occurred. Please try again or reload the
                page.
              </p>
            </div>

            {import.meta.env.DEV && this.state.error && (
              <details className="rounded-lg border bg-muted/50 p-4 text-left">
                <summary className="cursor-pointer text-sm font-medium text-foreground">
                  Error details
                </summary>
                <pre className="mt-2 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button
                variant="outline"
                onClick={this.handleReset}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </Button>
              <Button onClick={this.handleReload}>Reload page</Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
