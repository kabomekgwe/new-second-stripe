'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  SUPPORTED_SAVED_PAYMENT_METHOD_TYPES,
  type FxQuoteResponse,
} from '@/lib/shared';
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

type Step = 'amount' | 'method' | 'checkout' | 'success' | 'pending' | 'error';

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
  const supportedPaymentMethods = useMemo(
    () =>
      paymentMethods.filter((method) =>
        SUPPORTED_SAVED_PAYMENT_METHOD_TYPES.includes(
          method.type as (typeof SUPPORTED_SAVED_PAYMENT_METHOD_TYPES)[number],
        ),
      ),
    [paymentMethods],
  );
  const unsupportedSavedMethodCount =
    paymentMethods.length - supportedPaymentMethods.length;

  const defaultMethod = useMemo(
    () =>
      supportedPaymentMethods.find((method) => method.isDefault) ??
      supportedPaymentMethods[0] ??
      null,
    [supportedPaymentMethods],
  );
  const selectedMethod = useMemo(
    () =>
      supportedPaymentMethods.find(
        (method) => method.stripePaymentMethodId === selectedMethodId,
      ) ?? defaultMethod,
    [defaultMethod, selectedMethodId, supportedPaymentMethods],
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

  if (step === 'pending') {
    return (
      <PaymentStatus
        type="pending"
        message={errorMessage || 'Your payment is processing. We will update the final status in payment history shortly.'}
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
            onAmountChange={setAmountGbp}
            onNext={(amount) => {
              setAmountGbp(amount);
              setStep('method');
            }}
          />
        )}

        {step === 'method' && (
          <StepMethod
            methods={supportedPaymentMethods}
            unsupportedSavedMethodCount={unsupportedSavedMethodCount}
            isLoading={isLoadingPaymentMethods}
            selectedMethodId={selectedMethodId}
            onBack={() => setStep('amount')}
            onNext={async (paymentMethodId) => {
              try {
                const method = supportedPaymentMethods.find(
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
            onPending={(message) => {
              setStep('pending');
              setErrorMessage(message);
            }}
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
