import { apiSlice } from './api';
import type { UsageChargeResponse } from '@stripe-app/shared';

export const billingApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getBilling: builder.query<UsageChargeResponse[], void>({
      query: () => '/billing',
      providesTags: ['Billing'],
    }),
    getCurrentFee: builder.query<{ monthlyManagementFee: number | null; accountValue: number | null }, void>({
      query: () => '/billing/current-fee',
      providesTags: ['CurrentFee'],
    }),
  }),
});

export const { useGetBillingQuery, useGetCurrentFeeQuery } = billingApi;
