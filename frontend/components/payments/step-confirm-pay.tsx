'use client';

import type { FxQuoteResponse, PaymentMethodResponse } from '@stripe-app/shared';
import { useCreatePaymentIntentMutation } from '@/lib/store/payments-api';
import { PaymentMethodIcon } from '@/components/payment-methods/payment-method-icon';
import { stripePromise } from '@/lib/stripe';
import { getReadableErrorMessage } from '@/lib/error-utils';
import { formatPence, formatCurrency, getMethodLabel } from './payment-utils';

export function StepConfirmPay({
  amountGbp,
  quote,
  selectedMethod,
  fxQuoteId,
  onBack,
  onSuccess,
  onPending,
  onError,
}: {
  amountGbp: number;
  quote: FxQuoteResponse | null;
  selectedMethod: PaymentMethodResponse | null;
  fxQuoteId: string | undefined;
  onBack: () => void;
  onSuccess: () => void;
  onPending: (msg: string) => void;
  onError: (msg: string) => void;
}) {
  const [createPaymentIntent, { isLoading }] = useCreatePaymentIntentMutation();

  const handleConfirm = async () => {
    if (!selectedMethod) return;

    try {
      const result = await createPaymentIntent({
        amountGbp,
        paymentMethodId: selectedMethod.stripePaymentMethodId,
        ...(fxQuoteId ? { fxQuoteId } : {}),
      }).unwrap();

      if (result.status === 'succeeded') {
        onSuccess();
        return;
      }

      if (!result.clientSecret) {
        onError('Stripe did not return a client secret for confirmation.');
        return;
      }

      const stripe = await stripePromise;
      if (!stripe) {
        onError('Stripe.js failed to load. Please refresh and try again.');
        return;
      }

      const confirmation = await stripe.confirmCardPayment(
        result.clientSecret,
        {
          payment_method: selectedMethod.stripePaymentMethodId,
        },
      );

      if (confirmation.error) {
        onError(confirmation.error.message || 'Payment failed');
        return;
      }

      const paymentIntent = confirmation.paymentIntent;
      if (!paymentIntent) {
        onError('Stripe did not return a payment result. Please try again.');
        return;
      }

      switch (paymentIntent.status) {
        case 'succeeded':
          onSuccess();
          return;
        case 'processing':
          onPending(
            'Stripe is still processing this payment. Check payment history for the final result.',
          );
          return;
        case 'requires_payment_method':
          onError(
            'Stripe could not use the selected card. Please choose another saved card.',
          );
          return;
        case 'requires_action':
        case 'requires_confirmation':
          onError(
            'This payment still needs additional authentication. Please try again.',
          );
          return;
        case 'canceled':
          onError('This payment was canceled before it could be completed.');
          return;
        default:
          onError('Stripe returned an unexpected payment state.');
      }
    } catch (err: unknown) {
      onError(getReadableErrorMessage(err, 'Payment failed'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Review and Pay</h2>
        <p className="mt-1 text-sm text-gray-500">
          Confirm the details below and complete the payment.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Amount in GBP</span>
          <span className="text-base font-semibold text-slate-950">
            &pound;{formatPence(amountGbp)}
          </span>
        </div>
        {quote && quote.toCurrency.toLowerCase() !== 'gbp' && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-slate-600">Estimated local amount</span>
            <span className="text-base font-semibold text-slate-950">
              {formatCurrency(quote.toAmount, quote.toCurrency)}
            </span>
          </div>
        )}
        <div className="mt-3 flex items-start justify-between gap-4">
          <span className="text-sm text-slate-600">Payment method</span>
          <div className="text-right">
            <div className="flex items-center gap-2 justify-end">
              {selectedMethod && (
                <PaymentMethodIcon type={selectedMethod.type} brand={selectedMethod.brand} />
              )}
              <span className="text-sm font-semibold text-slate-950">
                {selectedMethod ? getMethodLabel(selectedMethod) : 'No method selected'}
              </span>
            </div>
            {selectedMethod?.expiryMonth && selectedMethod.expiryYear ? (
              <div className="text-xs text-slate-500">
                Expires {String(selectedMethod.expiryMonth).padStart(2, '0')}/{selectedMethod.expiryYear}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <button
        onClick={handleConfirm}
        disabled={isLoading || !selectedMethod}
        className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? 'Processing...' : `Pay \u00A3${formatPence(amountGbp)}`}
      </button>

      <button
        onClick={onBack}
        disabled={isLoading}
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Back
      </button>
    </div>
  );
}
