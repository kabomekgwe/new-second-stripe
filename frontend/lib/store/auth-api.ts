import { apiSlice } from './api';
import type { UserResponse, LoginRequest, RegisterRequest } from '@stripe-app/shared';

export const authApi = apiSlice.injectEndpoints({
  endpoints: (builder) => ({
    getMe: builder.query<UserResponse, void>({
      query: () => '/auth/me',
      providesTags: ['User'],
      // Keep data for 5 minutes to reduce refetches
      keepUnusedDataFor: 300,
    }),
    login: builder.mutation<UserResponse, LoginRequest>({
      query: (body) => ({ url: '/auth/login', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
    register: builder.mutation<UserResponse, RegisterRequest>({
      query: (body) => ({ url: '/auth/register', method: 'POST', body }),
      invalidatesTags: ['User'],
    }),
    logout: builder.mutation<void, void>({
      query: () => ({ url: '/auth/logout', method: 'POST' }),
      onQueryStarted: async (_, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
        } finally {
          dispatch(apiSlice.util.resetApiState());
        }
      },
    }),
  }),
});

export const { useGetMeQuery, useLoginMutation, useRegisterMutation, useLogoutMutation } = authApi;
