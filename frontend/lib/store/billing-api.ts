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
    triggerBilling: builder.mutation<UsageChargeResponse, void>({
      query: () => ({ url: '/billing/trigger', method: 'POST' }),
      invalidatesTags: ['Billing'],
    }),
    triggerAllBilling: builder.mutation<{ total: number; succeeded: number; failed: number; skipped: number }, void>({
      query: () => ({ url: '/billing/trigger-all', method: 'POST' }),
      invalidatesTags: ['Billing'],
    }),
  }),
});

export const {
  useGetBillingQuery,
  useGetCurrentFeeQuery,
  useTriggerBillingMutation,
  useTriggerAllBillingMutation,
} = billingApi;
