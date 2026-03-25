'use client';

import { useState, useEffect, useRef } from 'react';
import { useFxQuoteMutation } from '@/lib/store/payments-api';
import type { FxQuoteResponse } from '@stripe-app/shared';

interface StepAmountProps {
  amountGbp: number;
  fxQuote: FxQuoteResponse | null;
  onUpdate: (amountGbp: number, fxQuote: FxQuoteResponse | null) => void;
  onNext: () => void;
}

function formatPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

export function StepAmount({ amountGbp, fxQuote, onUpdate, onNext }: StepAmountProps) {
  const [inputValue, setInputValue] = useState(amountGbp > 0 ? formatPence(amountGbp) : '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fxQuoteTrigger] = useFxQuoteMutation();

  const penceValue = Math.round(parseFloat(inputValue || '0') * 100);
  const isValid = penceValue > 0 && !isNaN(penceValue);

  useEffect(() => {
    if (!isValid) {
      onUpdate(0, null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const quote = await fxQuoteTrigger({ amountGbp: penceValue }).unwrap();
        onUpdate(penceValue, quote);
      } catch {
        setError('Failed to get exchange rate');
        onUpdate(penceValue, null);
      } finally {
        setLoading(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputValue]);

  const showConversion = fxQuote && fxQuote.fromCurrency.toLowerCase() !== fxQuote.toCurrency.toLowerCase();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Enter Amount</h2>
        <p className="mt-1 text-sm text-gray-500">How much would you like to pay?</p>
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

      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {isValid && (
        <div className="rounded-lg bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">You pay</span>
            <span className="text-lg font-semibold text-gray-900">&pound;{formatPence(penceValue)}</span>
          </div>
          {loading && (
            <div className="mt-2 text-xs text-gray-400">Fetching exchange rate...</div>
          )}
          {showConversion && (
            <>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-sm text-gray-600">Recipient gets approx.</span>
                <span className="text-sm font-medium text-gray-700">
                  {formatPence(fxQuote.toAmount)} {fxQuote.toCurrency.toUpperCase()}
                </span>
              </div>
              <div className="mt-1 text-xs text-gray-400">
                Quote expires {new Date(fxQuote.expiresAt).toLocaleTimeString()}
              </div>
            </>
          )}
        </div>
      )}

      <button
        onClick={onNext}
        disabled={!isValid || loading}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        Continue
      </button>
    </div>
  );
}
