export function getReadableErrorMessage(
  error: unknown,
  fallback = 'Something went wrong. Please try again.',
): string {
  if (typeof error === 'string') {
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
