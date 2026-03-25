'use client';

import { useState, useEffect, useCallback } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { useCreateSetupIntentMutation } from '@/lib/store/payment-methods-api';
import { paymentMethodsApi } from '@/lib/store/payment-methods-api';
import Link from 'next/link';

export default function AddPaymentMethodPage() {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createSetupIntent] = useCreateSetupIntentMutation();

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

  // Auto-init on mount
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
          <svg className="mr-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

        {clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: 'stripe' },
            }}
          >
            <SetupForm />
          </Elements>
        )}
      </div>
    </div>
  );
}

function SetupForm() {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [lazyGetPaymentMethods] = paymentMethodsApi.endpoints.getPaymentMethods.useLazyQuery();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError('');

    const { error } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/payment-methods`,
      },
    });

    if (error) {
      setError(error.message || 'Setup failed. Please try again.');
      setSubmitting(false);
    } else {
      // Poll for the payment method to appear (webhook may take a moment)
      const maxAttempts = 6;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const result = await lazyGetPaymentMethods().unwrap();
          if (result.length > 0) {
            setSuccess(true);
            return;
          }
        } catch {
          // ignore polling errors
        }
      }
      // Fallback: show success anyway
      setSuccess(true);
    }
  }

  if (success) {
    return (
      <div className="mt-6">
        <div className="rounded-md bg-green-50 px-4 py-3 text-sm text-green-700">
          Payment method added successfully!
        </div>
        <Link
          href="/payment-methods"
          className="mt-4 inline-block rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Back to Payment Methods
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <PaymentElement />
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}
      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          disabled={!stripe || submitting}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {submitting ? 'Saving...' : 'Save Payment Method'}
        </button>
      </div>
    </form>
  );
}