import { apiSlice } from './api';
import type {
  PaymentResponse,
  CreatePaymentRequest,
  CreatePaymentResponse,
  FxQuoteRequest,
  FxQuoteResponse,
} from '@/lib/shared';

export const paymentsApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getPayments: builder.query<PaymentResponse[], void>({
      query: () => '/payments',
      providesTags: ['Payments'],
    }),
    getFxQuote: builder.mutation<FxQuoteResponse, FxQuoteRequest>({
      query: (body) => ({ url: '/payments/fx-quote', method: 'POST', body }),
    }),
    createPaymentIntent: builder.mutation<CreatePaymentResponse, CreatePaymentRequest>({
      query: (body) => ({ url: '/payments/create-intent', method: 'POST', body }),
      invalidatesTags: ['Payments'],
    }),
  }),
});

export const {
  useGetPaymentsQuery,
  useGetFxQuoteMutation,
  useCreatePaymentIntentMutation,
} = paymentsApi;
