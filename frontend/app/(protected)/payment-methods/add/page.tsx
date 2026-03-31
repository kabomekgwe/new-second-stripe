'use client';

import { useState, useEffect, useCallback } from 'react';
import { Elements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { useCreateSetupIntentMutation } from '@/lib/store/payment-methods-api';
import { useGetMeQuery } from '@/lib/store/auth-api';
import Link from 'next/link';
import { SetupForm } from '@/components/payment-methods/setup-form';

export default function AddPaymentMethodPage() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createSetupIntent] = useCreateSetupIntentMutation();
  const { data: user } = useGetMeQuery();

  const handleInit = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await createSetupIntent().unwrap();
      setClientSecret(result.clientSecret);
    } catch {
      setError('Failed to initialize. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [createSetupIntent]);

  useEffect(() => {
    if (!clientSecret && !loading && !error) {
      handleInit();
    }
  }, [clientSecret, loading, error, handleInit]);

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-6">
        <Link
          href="/payment-methods"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <svg aria-hidden="true" className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Payment Methods
        </Link>
      </div>

      <div className="rounded-xl bg-white p-6 shadow-sm border border-gray-200">
        <h1 className="text-lg font-semibold text-gray-900">Add Payment Method</h1>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading && (
          <div className="mt-6 text-center text-sm text-gray-500">Loading available payment methods...</div>
        )}

        {clientSecret && user && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: 'stripe' },
            }}
          >
            <SetupForm userEmail={user.email} userName={user.name ?? undefined} userCountry={user.country ?? undefined} />
          </Elements>
        )}
      </div>
    </div>
  );
}
