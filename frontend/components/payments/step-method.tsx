'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { PaymentMethodResponse } from '@/lib/shared';
import { PaymentMethodIcon } from '@/components/payment-methods/payment-method-icon';
import { getMethodLabel } from './payment-utils';

export function StepMethod({
  methods,
  unsupportedSavedMethodCount,
  isLoading,
  selectedMethodId,
  onBack,
  onNext,
}: {
  methods: PaymentMethodResponse[];
  unsupportedSavedMethodCount: number;
  isLoading: boolean;
  selectedMethodId: string | null;
  onBack: () => void;
  onNext: (paymentMethodId: string) => void;
}) {
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const activeSelection = localSelection ?? selectedMethodId ?? '';

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Choose Payment Method</h2>
          <p className="mt-1 text-sm text-gray-500">
            We&apos;re loading your saved payment methods.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          Loading payment methods...
        </div>
      </div>
    );
  }

  if (methods.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-medium text-gray-900">Choose Payment Method</h2>
          <p className="mt-1 text-sm text-gray-500">
            Add a payment method before you continue.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6">
          <p className="text-sm text-slate-600">
            {unsupportedSavedMethodCount > 0
              ? 'You only have saved payment methods that are not supported in this card payment flow yet.'
              : 'You don&apos;t have any saved payment methods yet.'}
          </p>
          <Link
            href="/payment-methods/add"
            className="mt-4 inline-flex rounded-lg bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
          >
            Add payment method
          </Link>
        </div>
        <button
          onClick={onBack}
          className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Choose Payment Method</h2>
        <p className="mt-1 text-sm text-gray-500">
          Pick the saved payment method you want Stripe to prefer for this payment.
        </p>
        {unsupportedSavedMethodCount > 0 ? (
          <p className="mt-2 text-sm text-amber-700">
            {unsupportedSavedMethodCount} saved payment method
            {unsupportedSavedMethodCount === 1 ? ' is' : 's are'} hidden because this flow currently supports cards only.
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        {methods.map((method) => {
          const isSelected = activeSelection === method.stripePaymentMethodId;

          return (
            <button
              key={method.id}
              type="button"
              onClick={() => setLocalSelection(method.stripePaymentMethodId)}
              className={`flex w-full items-center justify-between rounded-xl border px-4 py-4 text-left transition-colors ${
                isSelected
                  ? 'border-amber-400 bg-amber-50'
                  : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <div className="flex items-center gap-3">
                <PaymentMethodIcon type={method.type} brand={method.brand} />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-950">
                      {getMethodLabel(method)}
                    </span>
                    {method.isDefault ? (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700">
                        Default
                      </span>
                    ) : null}
                  </div>
                  {method.expiryMonth && method.expiryYear ? (
                    <p className="text-xs text-slate-500">
                      Expires {String(method.expiryMonth).padStart(2, '0')}/{method.expiryYear}
                    </p>
                  ) : null}
                </div>
              </div>
              <div
                className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                  isSelected ? 'border-amber-500 bg-amber-500' : 'border-slate-300'
                }`}
              >
                {isSelected ? <div className="h-2 w-2 rounded-full bg-white" /> : null}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
        >
          Back
        </button>
        <button
          onClick={() => {
            if (activeSelection) {
              onNext(activeSelection);
            }
          }}
          disabled={!activeSelection}
          className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to Review
        </button>
      </div>
    </div>
  );
}
