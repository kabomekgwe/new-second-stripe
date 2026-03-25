'use client';

import { useState } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { useCreateSetupIntentMutation } from '@/lib/store/payment-methods-api';
import { paymentMethodsApi } from '@/lib/store/payment-methods-api';

interface AddPaymentMethodModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export function AddPaymentMethodModal({ onClose, onSuccess }: AddPaymentMethodModalProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createSetupIntent] = useCreateSetupIntentMutation();

  async function handleInit() {
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
  }

  // Auto-init on mount
  if (!clientSecret && !loading && !error) {
    handleInit();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" role="dialog" aria-modal="true" aria-labelledby="add-pm-title">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 id="add-pm-title" className="text-lg font-semibold text-gray-900">Add Payment Method</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading && (
          <div className="mt-6 text-center text-sm text-gray-500">Setting up...</div>
        )}

        {clientSecret && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: 'stripe' },
            }}
          >
            <SetupForm onSuccess={onSuccess} onError={setError} />
          </Elements>
        )}
      </div>
    </div>
  );
}

function SetupForm({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [lazyGetPaymentMethods] = paymentMethodsApi.endpoints.getPaymentMethods.useLazyQuery();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    onError('');

    const { error } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/payment-methods`,
      },
    });

    if (error) {
      onError(error.message || 'Setup failed. Please try again.');
      setSubmitting(false);
    } else {
      // Poll for the payment method to appear (webhook may take a moment)
      const maxAttempts = 6;
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const result = await lazyGetPaymentMethods().unwrap();
          if (result.length > 0) {
            onSuccess();
            return;
          }
        } catch {
          // ignore polling errors
        }
      }
      // Fallback: call success anyway so UI updates
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <PaymentElement />
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
