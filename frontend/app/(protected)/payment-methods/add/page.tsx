'use client';

import { useState, useEffect, useCallback } from 'react';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { useCreateSetupIntentMutation, useSyncPaymentMethodMutation } from '@/lib/store/payment-methods-api';
import { useGetMeQuery } from '@/lib/store/auth-api';
import Link from 'next/link';
import { StripePaymentElementOptions } from '@stripe/stripe-js';

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

        {clientSecret && user && (
          <Elements
            stripe={stripePromise}
            options={{
              clientSecret,
              appearance: { theme: 'stripe' },
            }}
          >
            <SetupForm userEmail={user.email} userName={user.name ?? undefined} />
          </Elements>
        )}
      </div>
    </div>
  );
}

interface SetupFormProps {
  userEmail: string;
  userName?: string;
}

function SetupForm({ userEmail, userName }: SetupFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [syncPaymentMethod] = useSyncPaymentMethodMutation();


  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSubmitting(true);
    setError('');

    const { setupIntent, error } = await stripe.confirmSetup({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: `${window.location.origin}/payment-methods`,
        payment_method_data: {
          billing_details: {
            email: userEmail,
            name: userName,
          },
        },
      },
    });

    if (error) {
      setError(error.message || 'Setup failed. Please try again.');
      setSubmitting(false);
      return;
    }

    // Log the setup intent for debugging
    console.log('Setup intent result:', {
      id: setupIntent?.id,
      status: setupIntent?.status,
      payment_method: setupIntent?.payment_method,
    });

    // Check if setup succeeded
    if (setupIntent?.status !== 'succeeded') {
      setError('Payment setup did not complete. Please try again.');
      setSubmitting(false);
      return;
    }

    // Extract payment method ID
    const setupPaymentMethodId =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : (setupIntent.payment_method as { id: string })?.id ?? null;

    if (!setupPaymentMethodId) {
      console.error('No payment method ID in setup intent:', setupIntent);
      setError('Payment method was not properly attached. Please try again.');
      setSubmitting(false);
      return;
    }

    // Sync the payment method to the database
    try {
      await syncPaymentMethod(setupPaymentMethodId).unwrap();
      setSuccess(true);
    } catch (syncError) {
      console.error('Failed to sync payment method:', syncError);
      // Show success anyway - the payment method was added to Stripe
      // The webhook will eventually process it, or user can retry
      setSuccess(true);
    } finally {
      setSubmitting(false);
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

  const paymentOptions: StripePaymentElementOptions = {
    layout: {
      type: 'tabs',
      defaultCollapsed: false,
    },

    fields: {
      billingDetails: {
        name: 'auto',
        email: 'never', // We pass email from user account in confirmParams
        phone: 'auto', // We don't have phone, let Stripe collect if needed
        address: 'auto', // We don't have address, let Stripe collect if needed
      },
    },

    paymentMethodOrder: ['card', 'apple_pay'],

    wallets: {
      applePay: 'auto',
      googlePay: 'auto',
    },

    terms: {
      card: 'never',
    },
  };

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
      <PaymentElement options={paymentOptions} />
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
