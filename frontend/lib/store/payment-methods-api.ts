import { apiSlice } from './api';
import type { PaymentMethodResponse, SetupIntentResponse } from '@/lib/shared';

export const paymentMethodsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPaymentMethods: builder.query<PaymentMethodResponse[], void>({
      query: () => '/payment-methods',
      providesTags: ['PaymentMethods'],
    }),
    createSetupIntent: builder.mutation<SetupIntentResponse, void>({
      query: () => ({ url: '/payment-methods/setup-intent', method: 'POST' }),
    }),
    syncPaymentMethod: builder.mutation<PaymentMethodResponse, string>({
      query: (stripePaymentMethodId) => ({
        url: '/payment-methods/sync',
        method: 'POST',
        body: { stripePaymentMethodId },
      }),
      invalidatesTags: ['PaymentMethods'],
    }),
    setDefaultMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `/payment-methods/${id}/default`, method: 'POST' }),
      invalidatesTags: ['PaymentMethods'],
    }),
    deleteMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `/payment-methods/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PaymentMethods'],
    }),
  }),
});

export const {
  useGetPaymentMethodsQuery,
  useCreateSetupIntentMutation,
  useSyncPaymentMethodMutation,
  useSetDefaultMethodMutation,
  useDeleteMethodMutation,
} = paymentMethodsApi;
