'use client';

import type { FxQuoteResponse, PaymentMethodResponse } from '@stripe-app/shared';
import { useCreatePaymentIntentMutation } from '@/lib/store/payments-api';
import { PaymentMethodIcon } from '@/components/payment-methods/payment-method-icon';
import { formatPence, formatCurrency, getMethodLabel } from './payment-utils';

export function StepConfirmPay({
  amountGbp,
  quote,
  selectedMethod,
  fxQuoteId,
  onBack,
  onSuccess,
  onError,
}: {
  amountGbp: number;
  quote: FxQuoteResponse | null;
  selectedMethod: PaymentMethodResponse | null;
  fxQuoteId: string | undefined;
  onBack: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [createPaymentIntent, { isLoading }] = useCreatePaymentIntentMutation();

  const handleConfirm = async () => {
    if (!selectedMethod) return;

    try {
      await createPaymentIntent({
        amountGbp,
        paymentMethodId: selectedMethod.stripePaymentMethodId,
        ...(fxQuoteId ? { fxQuoteId } : {}),
      }).unwrap();
      onSuccess();
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? String((err as { data: { message?: string } }).data?.message || 'Payment failed')
          : 'Something went wrong. Please try again.';
      onError(message);
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
