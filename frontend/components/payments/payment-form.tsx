'use client';

import { useState, useEffect, useMemo } from 'react';
import type { FxQuoteResponse } from '@stripe-app/shared';
import { useGetFxQuoteMutation } from '@/lib/store/payments-api';
import {
  useGetPaymentMethodsQuery,
  useSetDefaultMethodMutation,
} from '@/lib/store/payment-methods-api';
import { PaymentStatus } from './payment-status';
import { StepIndicator } from './step-indicator';
import { StepAmount } from './step-amount';
import { StepMethod } from './step-method';
import { StepConfirmPay } from './step-confirm-pay';

type Step = 'amount' | 'method' | 'checkout' | 'success' | 'error';

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
          <StepConfirmPay
            amountGbp={amountGbp}
            quote={fxQuote}
            selectedMethod={selectedMethod}
            fxQuoteId={fxQuote?.quoteId || undefined}
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
