import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';

const baseQuery = fetchBaseQuery({
  baseUrl: process.env.NEXT_PUBLIC_CORE_API_URL || 'http://localhost:3001',
  credentials: 'include',
  prepareHeaders: (headers) => {
    headers.set('Content-Type', 'application/json');
    return headers;
  },
});

const baseQueryWithAuth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  api,
  extraOptions,
) => {
  const result = await baseQuery(args, api, extraOptions);

  if (
    result.error?.status === 401 &&
    typeof window !== 'undefined' &&
    !window.location.pathname.includes('/auth/')
  ) {
    window.location.href = '/auth/login?expired=1';
    return new Promise(() => {}); // never resolves — page is redirecting
  }

  return result;
};

export const apiSlice = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithAuth,
  tagTypes: ['User', 'Payments', 'PaymentMethods', 'AvailableMethods', 'Billing', 'CurrentFee'],
  endpoints: () => ({}),
});
