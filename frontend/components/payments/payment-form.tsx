'use client';

import { useState, useCallback } from 'react';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { stripePromise } from '@/lib/stripe';
import { useCreateCheckoutSessionMutation } from '@/lib/store/payments-api';
import { PaymentStatus } from './payment-status';

type Step = 'amount' | 'checkout' | 'success' | 'error';

const STEP_LABELS = ['Amount', 'Pay'];

function StepIndicator({ currentStep }: { currentStep: number }) {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {STEP_LABELS.map((label, i) => {
          const stepNum = i + 1;
          const isActive = stepNum === currentStep;
          const isComplete = stepNum < currentStep;
          return (
            <div key={label} className="flex flex-1 flex-col items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
                  isComplete
                    ? 'bg-blue-600 text-white'
                    : isActive
                      ? 'border-2 border-blue-600 text-blue-600'
                      : 'border-2 border-gray-300 text-gray-400'
                }`}
              >
                {isComplete ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  stepNum
                )}
              </div>
              <span className={`mt-1 text-xs ${isActive ? 'font-medium text-blue-600' : 'text-gray-400'}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex">
        <div className="flex-1 px-4">
          <div className={`h-1 rounded ${currentStep > 1 ? 'bg-blue-600' : 'bg-gray-200'}`} />
        </div>
      </div>
    </div>
  );
}

function formatPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

function StepAmount({ onNext }: { onNext: (amountGbp: number) => void }) {
  const [inputValue, setInputValue] = useState('');

  const penceValue = Math.round(parseFloat(inputValue || '0') * 100);
  const isValid = penceValue > 0 && !isNaN(penceValue);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Enter Amount</h2>
        <p className="mt-1 text-sm text-gray-500">
          How much would you like to pay? The price will be shown in your local currency at checkout.
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
        <div className="rounded-lg bg-gray-50 p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">You pay</span>
            <span className="text-lg font-semibold text-gray-900">&pound;{formatPence(penceValue)}</span>
          </div>
          <div className="mt-1 text-xs text-gray-400">
            Adaptive pricing will show the amount in your local currency
          </div>
        </div>
      )}

      <button
        onClick={() => onNext(penceValue)}
        disabled={!isValid}
        className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        Continue to Payment
      </button>
    </div>
  );
}

function StepCheckout({
  amountGbp,
  onBack,
  onSuccess,
  onError,
}: {
  amountGbp: number;
  onBack: () => void;
  onSuccess: () => void;
  onError: (msg: string) => void;
}) {
  const [createCheckoutSession] = useCreateCheckoutSessionMutation();

  const fetchClientSecret = useCallback(async () => {
    try {
      const result = await createCheckoutSession({ amountGbp }).unwrap();
      return result.clientSecret;
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'data' in err
          ? String((err as { data: { message?: string } }).data?.message || 'Payment failed')
          : 'Something went wrong. Please try again.';
      onError(message);
      throw err;
    }
  }, [createCheckoutSession, amountGbp, onError]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Complete Payment</h2>
        <p className="mt-1 text-sm text-gray-500">
          &pound;{formatPence(amountGbp)} GBP — price shown in your local currency below.
        </p>
      </div>

      <EmbeddedCheckoutProvider
        stripe={stripePromise}
        options={{
          fetchClientSecret,
          onComplete: onSuccess,
        }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>

      <button
        onClick={onBack}
        className="w-full rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
      >
        Back
      </button>
    </div>
  );
}

export function PaymentForm() {
  const [step, setStep] = useState<Step>('amount');
  const [amountGbp, setAmountGbp] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  if (step === 'success') {
    return <PaymentStatus type="success" />;
  }

  if (step === 'error') {
    return (
      <PaymentStatus
        type="error"
        message={errorMessage}
        onRetry={() => { setStep('amount'); setErrorMessage(''); }}
      />
    );
  }

  const currentStepNum = step === 'amount' ? 1 : 2;

  return (
    <div className="mx-auto max-w-lg">
      <StepIndicator currentStep={currentStepNum} />

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {step === 'amount' && (
          <StepAmount
            onNext={(amount) => {
              setAmountGbp(amount);
              setStep('checkout');
            }}
          />
        )}

        {step === 'checkout' && (
          <StepCheckout
            amountGbp={amountGbp}
            onBack={() => setStep('amount')}
            onSuccess={() => setStep('success')}
            onError={(msg) => { setStep('error'); setErrorMessage(msg); }}
          />
        )}
      </div>
    </div>
  );
}
