import { apiSlice } from './api';
import type {
  PaymentResponse,
  FxQuoteRequest,
  FxQuoteResponse,
  CreatePaymentRequest,
  CreatePaymentResponse,
  CreateCheckoutSessionRequest,
  CreateCheckoutSessionResponse,
} from '@stripe-app/shared';

export const paymentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPayments: builder.query<PaymentResponse[], void>({
      query: () => '/payments',
      providesTags: ['Payments'],
    }),
    fxQuote: builder.mutation<FxQuoteResponse, FxQuoteRequest>({
      query: (body) => ({ url: '/payments/fx-quote', method: 'POST', body }),
    }),
    createPaymentIntent: builder.mutation<CreatePaymentResponse, CreatePaymentRequest>({
      query: (body) => ({ url: '/payments/create-intent', method: 'POST', body }),
      invalidatesTags: ['Payments'],
    }),
    createCheckoutSession: builder.mutation<CreateCheckoutSessionResponse, CreateCheckoutSessionRequest>({
      query: (body) => ({ url: '/payments/create-checkout-session', method: 'POST', body }),
      invalidatesTags: ['Payments'],
    }),
  }),
});

export const {
  useGetPaymentsQuery,
  useFxQuoteMutation,
  useCreatePaymentIntentMutation,
  useCreateCheckoutSessionMutation,
} = paymentsApi;
