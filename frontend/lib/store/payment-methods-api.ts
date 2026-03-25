import { apiSlice } from './api';
import type {
  PaymentMethodResponse,
  AvailablePaymentMethodType,
  SetupIntentResponse,
} from '@stripe-app/shared';

export const paymentMethodsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPaymentMethods: builder.query<PaymentMethodResponse[], void>({
      query: () => '/payment-methods',
      providesTags: ['PaymentMethods'],
    }),
    getAvailableMethodTypes: builder.query<AvailablePaymentMethodType[], void>({
      query: () => '/payment-methods/available',
      providesTags: ['AvailableMethods'],
    }),
    createSetupIntent: builder.mutation<SetupIntentResponse, void>({
      query: () => ({ url: '/payment-methods/setup-intent', method: 'POST' }),
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
  useGetAvailableMethodTypesQuery,
  useCreateSetupIntentMutation,
  useSetDefaultMethodMutation,
  useDeleteMethodMutation,
} = paymentMethodsApi;
