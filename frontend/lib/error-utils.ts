export function getReadableErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  const backendUnavailableMessage =
    'Cannot reach backend service. Please check that services are running and try again.';

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: unknown }).status === 'FETCH_ERROR'
  ) {
    return backendUnavailableMessage;
  }

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: unknown }).status === 'PARSING_ERROR' &&
    'data' in error &&
    typeof (error as { data?: unknown }).data === 'string' &&
    (error as { data: string }).data.toLowerCase().includes('internal server error')
  ) {
    return backendUnavailableMessage;
  }

  if (
    error &&
    typeof error === 'object' &&
    'status' in error &&
    (error as { status?: unknown }).status === 500 &&
    'data' in error &&
    typeof (error as { data?: unknown }).data === 'string' &&
    (error as { data: string }).data.toLowerCase().includes('internal server error')
  ) {
    return backendUnavailableMessage;
  }

  if (typeof error === 'string') {
    if (error.toLowerCase().includes('internal server error')) {
      return backendUnavailableMessage;
    }
    return error;
  }

  if (error && typeof error === 'object') {
    if ('data' in error) {
      return getReadableErrorMessage(
        (error as { data?: unknown }).data,
        fallback,
      );
    }

    if ('message' in error) {
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
          return fallback;
        }
      }
    }
  }

  return fallback;
}
