import { apiSlice } from './api';
import type {
  PaymentResponse,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
} from '@stripe-app/shared';

export const paymentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPayments: builder.query<PaymentResponse[], void>({
      query: () => '/payments',
      providesTags: ['Payments'],
    }),
    createCheckoutSession: builder.mutation<CreateCheckoutSessionResponse, CreateCheckoutSessionRequest>({
      query: (body) => ({ url: '/payments/create-checkout-session', method: 'POST', body }),
      invalidatesTags: ['Payments'],
    }),
  }),
});

export const {
  useGetPaymentsQuery,
  useCreateCheckoutSessionMutation,
} = paymentsApi;
