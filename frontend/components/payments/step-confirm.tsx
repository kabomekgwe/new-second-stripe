'use client';

import { useState, useEffect } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { api } from '@/lib/api-client';
import type { FxQuoteResponse, CreatePaymentRequest, CreatePaymentResponse } from '@stripe-app/shared';

interface StepConfirmProps {
  amountGbp: number;
  fxQuote: FxQuoteResponse | null;
  paymentMethodId: string;
  onSuccess: () => void;
  onError: (message: string) => void;
  onBack: () => void;
}

function formatPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

function ConfirmForm({
  amountGbp,
  fxQuote,
  onSuccess,
  onInlineError,
}: {
  amountGbp: number;
  fxQuote: FxQuoteResponse | null;
  onSuccess: () => void;
  onInlineError: (msg: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const showConversion = fxQuote && fxQuote.fromCurrency.toLowerCase() !== fxQuote.toCurrency.toLowerCase();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError('');

    const { error: stripeError } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/payments`,
      },
    });

    if (stripeError) {
      setError(stripeError.message || 'Payment failed. Please try again.');
      setSubmitting(false);
    } else {
      onSuccess();
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg bg-gray-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Amount</span>
          <span className="text-lg font-semibold text-gray-900">&pound;{formatPence(amountGbp)} GBP</span>
        </div>
        {showConversion && (
          <div className="mt-1 flex items-center justify-between">
            <span className="text-sm text-gray-600">Converted amount</span>
            <span className="text-sm font-medium text-gray-700">
              &asymp; {formatPence(fxQuote.toAmount)} {fxQuote.toCurrency.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      <PaymentElement />

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {submitting ? 'Processing...' : `Pay \u00A3${formatPence(amountGbp)}`}
      </button>
    </form>
  );
}

export function StepConfirm({ amountGbp, fxQuote, paymentMethodId, onSuccess, onError, onBack }: StepConfirmProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function createIntent() {
      try {
        const body: CreatePaymentRequest = {
          amountGbp,
          paymentMethodId,
          ...(fxQuote?.quoteId ? { fxQuoteId: fxQuote.quoteId } : {}),
        };
        const { clientSecret } = await api.post<CreatePaymentResponse>('/payments/create-intent', body);
        setClientSecret(clientSecret);
      } catch {
        onError('Failed to create payment. Please try again.');
      } finally {
        setLoading(false);
      }
    }
    createIntent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Confirm Payment</h2>
          <p className="mt-1 text-sm text-gray-500">Setting up your payment...</p>
        </div>
        <div className="text-center text-sm text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!clientSecret) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Confirm Payment</h2>
        <p className="mt-1 text-sm text-gray-500">Review and confirm your payment details.</p>
      </div>

      <Elements
        stripe={stripePromise}
        options={{
          clientSecret,
          appearance: { theme: 'stripe' },
        }}
      >
        <ConfirmForm
          amountGbp={amountGbp}
          fxQuote={fxQuote}
          onSuccess={onSuccess}
          onInlineError={() => {}}
        />
      </Elements>

      <button
        onClick={onBack}
        className="w-full rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        Back
      </button>
    </div>
  );
}
