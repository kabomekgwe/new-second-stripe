'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorMessage: string | null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && typeof error.message === 'string') {
    return error.message;
  }

  if (
    error &&
    typeof error === 'object' &&
    'message' in error
  ) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') {
      return message;
    }
    if (Array.isArray(message)) {
      return message.map((entry) => String(entry)).join(', ');
    }
    if (message && typeof message === 'object') {
      try {
        return JSON.stringify(message);
      } catch {
        return 'An unexpected error occurred.';
      }
    }
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return 'An unexpected error occurred.';
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: unknown): State {
    return { hasError: true, errorMessage: getErrorMessage(error) };
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-800">Something went wrong</h2>
          <p className="mt-2 text-sm text-red-600">
            {this.state.errorMessage || 'An unexpected error occurred.'}
          </p>
          <button
            onClick={() =>
              this.setState({ hasError: false, errorMessage: null })
            }
            className="mt-4 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
