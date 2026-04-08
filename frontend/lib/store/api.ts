import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

// Cache for CSRF token
let csrfToken: string | null = null;

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:4917',
  credentials: 'include',
  prepareHeaders: (headers) => {
    headers.set('Content-Type', 'application/json');
    return headers;
  },
});

/**
 * Fetches a fresh CSRF token from the server.
 */
async function fetchCsrfToken(): Promise<string> {
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:4917'}/csrf/token`,
    { credentials: 'include' }
  );
  if (!response.ok) {
    throw new Error('Failed to fetch CSRF token');
  }
  const data = await response.json();
  csrfToken = data.csrfToken;
  return data.csrfToken;
}

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  // For mutation requests (POST, PUT, DELETE, PATCH), ensure we have a CSRF token
  // Note: Check method regardless of body - some mutations (like createSetupIntent) have no body
  const isMutation = typeof args === 'object' && ['POST', 'PUT', 'DELETE', 'PATCH'].includes(args.method || 'POST');
  if (isMutation) {
    if (!csrfToken) {
      try {
        await fetchCsrfToken();
      } catch {
        // If CSRF token fetch fails, proceed anyway (server will reject if CSRF is required)
      }
    }
    if (csrfToken && typeof args === 'object') {
      args.headers = {
        ...args.headers,
        'x-csrf-token': csrfToken,
      };
    }
  }

  const result = await baseQuery(args, api, extraOptions);

  // Handle CSRF token errors
  if (result.error?.status === 403 && result.error?.data === 'invalid csrf token') {
    // Clear cached token and retry once
    csrfToken = null;
    try {
      await fetchCsrfToken();
      if (csrfToken && typeof args === 'object') {
        args.headers = {
          ...args.headers,
          'x-csrf-token': csrfToken,
        };
      }
      return await baseQuery(args, api, extraOptions);
    } catch {
      // Return original error if retry fails
      return result;
    }
  }

  // Handle 401 errors - redirect to login
  if (
    result.error?.status === 401 &&
    typeof window !== 'undefined' &&
    !window.location.pathname.includes('/auth/')
  ) {
    window.location.href = '/auth/login?expired=1';
    // Return a rejected promise with the error instead of never-resolving promise
    return { error: { status: 401, data: 'Unauthorized' } as FetchBaseQueryError };
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['User', 'Payments', 'PaymentMethods', 'AvailableMethods', 'Billing', 'CurrentFee', 'Csrf'],
  endpoints: (builder) => ({
    // Endpoint to fetch CSRF token manually if needed
    getCsrfToken: builder.query<{ csrfToken: string }, void>({
      query: () => '/csrf/token',
    }),
  }),
});
