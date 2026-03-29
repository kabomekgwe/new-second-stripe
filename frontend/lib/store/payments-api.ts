import { apiSlice } from './api';
import type {
  PaymentResponse,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
  FxQuoteRequest,
  FxQuoteResponse,
} from '@stripe-app/shared';

export const paymentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPayments: builder.query<PaymentResponse[], void>({
      query: () => '/payments',
      providesTags: ['Payments'],
    }),
    getFxQuote: builder.mutation<FxQuoteResponse, FxQuoteRequest>({
      query: (body) => ({ url: '/payments/fx-quote', method: 'POST', body }),
    }),
    createCheckoutSession: builder.mutation<CreateCheckoutSessionResponse, CreateCheckoutSessionRequest>({
      query: (body) => ({ url: '/payments/create-checkout-session', method: 'POST', body }),
      invalidatesTags: ['Payments'],
    }),
  }),
});

export const {
  useGetPaymentsQuery,
  useGetFxQuoteMutation,
  useCreateCheckoutSessionMutation,
} = paymentsApi;
