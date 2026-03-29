'use client';

import Link from 'next/link';
import { useState, useCallback, useEffect, useMemo } from 'react';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import type { FxQuoteResponse, PaymentMethodResponse } from '@stripe-app/shared';
import { stripePromise } from '@/lib/stripe';
import {
  useCreateCheckoutSessionMutation,
  useGetFxQuoteMutation,
} from '@/lib/store/payments-api';
import {
  useGetPaymentMethodsQuery,
  useSetDefaultMethodMutation,
} from '@/lib/store/payment-methods-api';
import { PaymentMethodIcon } from '@/components/payment-methods/payment-method-icon';
import { PaymentStatus } from './payment-status';

type Step = 'amount' | 'method' | 'checkout' | 'success' | 'error';

const STEP_LABELS = ['Amount', 'Method', 'Pay'];

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
        <div className="flex-1 px-4">
          <div className={`h-1 rounded ${currentStep > 2 ? 'bg-blue-600' : 'bg-gray-200'}`} />
        </div>
      </div>
    </div>
  );
}

function formatPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function getMethodLabel(method: PaymentMethodResponse): string {
  if (method.type === 'card' && method.brand) {
    const brand = method.brand.charAt(0).toUpperCase() + method.brand.slice(1);
    return method.last4 ? `${brand} ending in ${method.last4}` : brand;
  }

  if (method.last4) {
    return `${method.type} ending in ${method.last4}`;
  }

  return method.type;
}

function StepAmount({
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

function StepMethod({
  methods,
  isLoading,
  selectedMethodId,
  onBack,
  onNext,
}: {
  methods: PaymentMethodResponse[];
  isLoading: boolean;
  selectedMethodId: string | null;
  onBack: () => void;
  onNext: (paymentMethodId: string) => void;
}) {
  const [localSelection, setLocalSelection] = useState(selectedMethodId ?? '');

  useEffect(() => {
    setLocalSelection(selectedMethodId ?? '');
  }, [selectedMethodId]);

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
            You don&apos;t have any saved payment methods yet.
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
      </div>

      <div className="space-y-3">
        {methods.map((method) => {
          const isSelected = localSelection === method.stripePaymentMethodId;

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
            if (localSelection) {
              onNext(localSelection);
            }
          }}
          disabled={!localSelection}
          className="flex-1 rounded-xl bg-slate-950 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue to Review
        </button>
      </div>
    </div>
  );
}

function StepCheckout({
  amountGbp,
  quote,
  selectedMethod,
  onBack,
  onSuccess,
  onError,
}: {
  amountGbp: number;
  quote: FxQuoteResponse | null;
  selectedMethod: PaymentMethodResponse | null;
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
        <h2 className="text-lg font-medium text-gray-900">Review and Pay</h2>
        <p className="mt-1 text-sm text-gray-500">
          Confirm the details below, then complete the payment inside the embedded Stripe checkout.
        </p>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Amount in GBP</span>
          <span className="text-base font-semibold text-slate-950">
            &pound;{formatPence(amountGbp)}
          </span>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm text-slate-600">Estimated local amount</span>
          <span className="text-base font-semibold text-slate-950">
            {quote
              ? formatCurrency(quote.toAmount, quote.toCurrency)
              : 'Shown at checkout'}
          </span>
        </div>
        <div className="mt-3 flex items-start justify-between gap-4">
          <span className="text-sm text-slate-600">Preferred payment method</span>
          <div className="text-right">
            <div className="text-sm font-semibold text-slate-950">
              {selectedMethod ? getMethodLabel(selectedMethod) : 'Stripe will use your default method'}
            </div>
            {selectedMethod?.expiryMonth && selectedMethod.expiryYear ? (
              <div className="text-xs text-slate-500">
                Expires {String(selectedMethod.expiryMonth).padStart(2, '0')}/{selectedMethod.expiryYear}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <EmbeddedCheckoutProvider
        key={`${amountGbp}-${selectedMethod?.stripePaymentMethodId ?? 'default'}`}
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
        className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
      >
        Back
      </button>
    </div>
  );
}

export function PaymentForm() {
  const { data: paymentMethods = [], isLoading: isLoadingPaymentMethods } =
    useGetPaymentMethodsQuery();
  const [getFxQuote] = useGetFxQuoteMutation();
  const [step, setStep] = useState<Step>('amount');
  const [amountGbp, setAmountGbp] = useState(0);
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [fxQuote, setFxQuote] = useState<FxQuoteResponse | null>(null);
  const [isQuoteLoading, setIsQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState('');
  const [setDefaultMethod] = useSetDefaultMethodMutation();
  const [errorMessage, setErrorMessage] = useState('');

  const defaultMethod = useMemo(
    () => paymentMethods.find((method) => method.isDefault) ?? paymentMethods[0] ?? null,
    [paymentMethods],
  );
  const selectedMethod = useMemo(
    () =>
      paymentMethods.find(
        (method) => method.stripePaymentMethodId === selectedMethodId,
      ) ?? defaultMethod,
    [defaultMethod, paymentMethods, selectedMethodId],
  );

  useEffect(() => {
    if (!selectedMethodId && defaultMethod) {
      setSelectedMethodId(defaultMethod.stripePaymentMethodId);
    }
  }, [defaultMethod, selectedMethodId]);

  useEffect(() => {
    if (amountGbp <= 0) {
      setFxQuote(null);
      setQuoteError('');
      setIsQuoteLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(async () => {
      setIsQuoteLoading(true);
      setQuoteError('');

      try {
        const quote = await getFxQuote({ amountGbp }).unwrap();
        setFxQuote(quote);
      } catch {
        setFxQuote(null);
        setQuoteError('Unable to refresh the FX quote right now. You can still continue to checkout.');
      } finally {
        setIsQuoteLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [amountGbp, getFxQuote]);

  if (step === 'success') {
    return <PaymentStatus type="success" />;
  }

  if (step === 'error') {
    return (
      <PaymentStatus
        type="error"
        message={errorMessage}
        onRetry={() => {
          setStep('amount');
          setErrorMessage('');
        }}
      />
    );
  }

  const currentStepNum =
    step === 'amount' ? 1 : step === 'method' ? 2 : 3;

  return (
    <div className="mx-auto max-w-lg">
      <StepIndicator currentStep={currentStepNum} />

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {step === 'amount' && (
          <StepAmount
            initialAmountGbp={amountGbp}
            quote={fxQuote}
            quoteError={quoteError}
            isQuoteLoading={isQuoteLoading}
            onNext={(amount) => {
              setAmountGbp(amount);
              setStep('method');
            }}
          />
        )}

        {step === 'method' && (
          <StepMethod
            methods={paymentMethods}
            isLoading={isLoadingPaymentMethods}
            selectedMethodId={selectedMethodId}
            onBack={() => setStep('amount')}
            onNext={async (paymentMethodId) => {
              try {
                const method = paymentMethods.find(
                  (entry) => entry.stripePaymentMethodId === paymentMethodId,
                );

                if (!method) {
                  setStep('error');
                  setErrorMessage('Selected payment method could not be found.');
                  return;
                }

                if (!method.isDefault) {
                  await setDefaultMethod(method.id).unwrap();
                }

                setSelectedMethodId(paymentMethodId);
                setStep('checkout');
              } catch {
                setStep('error');
                setErrorMessage(
                  'Unable to prepare the selected payment method. Please try again.',
                );
              }
            }}
          />
        )}

        {step === 'checkout' && (
          <StepCheckout
            amountGbp={amountGbp}
            quote={fxQuote}
            selectedMethod={selectedMethod}
            onBack={() => setStep('method')}
            onSuccess={() => setStep('success')}
            onError={(msg) => {
              setStep('error');
              setErrorMessage(msg);
            }}
          />
        )}
      </div>
    </div>
  );
}
