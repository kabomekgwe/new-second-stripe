'use client';

import { useState } from 'react';
import type { FxQuoteResponse } from '@stripe-app/shared';
import { formatPence, formatCurrency } from './payment-utils';

export function StepAmount({
  initialAmountGbp,
  quote,
  quoteError,
  isQuoteLoading,
  onNext,
}: {
  initialAmountGbp: number;
  quote: FxQuoteResponse | null;
  quoteError: string;
  isQuoteLoading: boolean;
  onNext: (amountGbp: number) => void;
}) {
  const [inputValue, setInputValue] = useState(
    initialAmountGbp > 0 ? formatPence(initialAmountGbp) : '',
  );

  const penceValue = Math.round(parseFloat(inputValue || '0') * 100);
  const isValid = penceValue > 0 && !isNaN(penceValue);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Enter Amount</h2>
        <p className="mt-1 text-sm text-gray-500">
          Enter the amount in GBP. We&apos;ll preview the converted amount in your own currency below.
        </p>
      </div>

      <div>
        <label htmlFor="amount" className="block text-sm font-medium text-gray-700">
          Amount (GBP)
        </label>
        <div className="relative mt-1">
          <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
            &pound;
          </span>
          <input
            id="amount"
            type="text"
            inputMode="decimal"
            placeholder="0.00"
            value={inputValue}
            onChange={(e) => {
              const val = e.target.value;
              if (/^\d*\.?\d{0,2}$/.test(val) || val === '') {
                setInputValue(val);
              }
            }}
            className="block w-full rounded-md border border-gray-300 py-2.5 pl-8 pr-4 text-lg text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {isValid && (
        <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-600">You enter</span>
            <span className="text-lg font-semibold text-slate-950">&pound;{formatPence(penceValue)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-sm text-slate-600">Estimated local total</span>
            <span className="text-lg font-semibold text-slate-950">
              {quote
                ? formatCurrency(quote.toAmount, quote.toCurrency)
                : isQuoteLoading
                  ? 'Refreshing...'
                  : 'Waiting for quote'}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {quote
              ? `Quote locked from ${quote.fromCurrency.toUpperCase()} to ${quote.toCurrency.toUpperCase()}`
              : 'This preview comes from Stripe FX quotes and will be confirmed in the payment step.'}
          </div>
          {quoteError ? (
            <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {quoteError}
            </div>
          ) : null}
        </div>
      )}

      <button
        onClick={() => onNext(penceValue)}
        disabled={!isValid}
        className="w-full rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue to Payment Method
      </button>
    </div>
  );
}
