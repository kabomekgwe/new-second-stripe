'use client';

import { useState } from 'react';
import { PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { useSyncPaymentMethodMutation } from '@/lib/store/payment-methods-api';
import Link from 'next/link';
import type { StripePaymentElementOptions } from '@stripe/stripe-js';
import { getReadableErrorMessage } from '@/lib/error-utils';

interface SetupFormProps {
  userEmail: string;
  userName?: string;
  userCountry?: string;
}

export function SetupForm({ userEmail, userName, userCountry }: SetupFormProps) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [syncPaymentMethod] = useSyncPaymentMethodMutation();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!stripe || !elements || submitting) return;

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
            ...(userCountry && { address: { country: userCountry } }),
          },
        },
      },
    });

    if (error) {
      if (error.code === 'setup_intent_unexpected_state' && error.setup_intent?.status === 'succeeded') {
        const alreadySucceededPmId = error.setup_intent.payment_method as string | null;
        if (alreadySucceededPmId) {
          try {
            await syncPaymentMethod(alreadySucceededPmId).unwrap();
            setSuccess(true);
          } catch (syncError) {
            console.error('Failed to sync already-succeeded payment method:', JSON.stringify(syncError));
            setError('Payment method was already confirmed but failed to save. Please refresh the page.');
          } finally {
            setSubmitting(false);
          }
          return;
        }
      }

      setError(getReadableErrorMessage(error, 'Setup failed. Please try again.'));
      setSubmitting(false);
      return;
    }

    if (!setupIntent) {
      setError('No setup intent returned. Please try again.');
      setSubmitting(false);
      return;
    }

    if (setupIntent.status !== 'succeeded') {
      setError(`Payment setup ${setupIntent.status}. Please try again.`);
      setSubmitting(false);
      return;
    }

    let paymentMethodId: string | null =
      typeof setupIntent.payment_method === 'string'
        ? setupIntent.payment_method
        : (setupIntent.payment_method as { id: string })?.id ?? null;

    if (!paymentMethodId && setupIntent.id) {
      try {
        const retrievedIntent = await stripe.retrieveSetupIntent(setupIntent.client_secret ?? '');
        if (retrievedIntent.setupIntent?.payment_method) {
          paymentMethodId =
            typeof retrievedIntent.setupIntent.payment_method === 'string'
              ? retrievedIntent.setupIntent.payment_method
              : (retrievedIntent.setupIntent.payment_method as { id: string })?.id ?? null;
        }
      } catch (retrieveError) {
        console.error('Failed to retrieve setup intent:', retrieveError);
      }
    }

    if (!paymentMethodId) {
      console.error('No payment method ID in setup intent:', setupIntent);
      setError('Payment method was not properly attached. Please try again.');
      setSubmitting(false);
      return;
    }

    try {
      await syncPaymentMethod(paymentMethodId).unwrap();
      setSuccess(true);
    } catch (syncError) {
      console.error('Failed to sync payment method:', JSON.stringify(syncError));
      setError('Payment method was confirmed but failed to save. Please refresh the page — it may appear shortly via webhook.');
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
    defaultValues: {
      billingDetails: {
        name: userName ?? '',
        email: userEmail,
      },
    },
    fields: {
      billingDetails: 'auto',
    },
    wallets: {
      applePay: 'never',
      googlePay: 'never',
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
