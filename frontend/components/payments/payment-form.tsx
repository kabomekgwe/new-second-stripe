'use client';

import { useState } from 'react';
import type { FxQuoteResponse } from '@stripe-app/shared';
import { StepAmount } from './step-amount';
import { StepSelectMethod } from './step-select-method';
import { StepConfirm } from './step-confirm';
import { PaymentStatus } from './payment-status';

type Step = 1 | 2 | 3 | 'success' | 'error';

interface PaymentState {
  step: Step;
  amountGbp: number;
  fxQuote: FxQuoteResponse | null;
  selectedPaymentMethodId: string;
  clientSecret: string;
  errorMessage: string;
}

const STEP_LABELS = ['Amount', 'Payment Method', 'Confirm'];

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
        {[1, 2].map((i) => (
          <div key={i} className="flex-1 px-4">
            <div className={`h-1 rounded ${i < currentStep ? 'bg-blue-600' : 'bg-gray-200'}`} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PaymentForm() {
  const [state, setState] = useState<PaymentState>({
    step: 1,
    amountGbp: 0,
    fxQuote: null,
    selectedPaymentMethodId: '',
    clientSecret: '',
    errorMessage: '',
  });

  function updateState(partial: Partial<PaymentState>) {
    setState((prev) => ({ ...prev, ...partial }));
  }

  if (state.step === 'success') {
    return <PaymentStatus type="success" />;
  }

  if (state.step === 'error') {
    return (
      <PaymentStatus
        type="error"
        message={state.errorMessage}
        onRetry={() => updateState({ step: 1, errorMessage: '' })}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg">
      <StepIndicator currentStep={state.step} />

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {state.step === 1 && (
          <StepAmount
            amountGbp={state.amountGbp}
            fxQuote={state.fxQuote}
            onUpdate={(amountGbp, fxQuote) => updateState({ amountGbp, fxQuote })}
            onNext={() => updateState({ step: 2 })}
          />
        )}

        {state.step === 2 && (
          <StepSelectMethod
            selectedId={state.selectedPaymentMethodId}
            onSelect={(id) => updateState({ selectedPaymentMethodId: id })}
            onBack={() => updateState({ step: 1 })}
            onNext={() => updateState({ step: 3 })}
          />
        )}

        {state.step === 3 && (
          <StepConfirm
            amountGbp={state.amountGbp}
            fxQuote={state.fxQuote}
            paymentMethodId={state.selectedPaymentMethodId}
            onSuccess={() => updateState({ step: 'success' })}
            onError={(msg) => updateState({ step: 'error', errorMessage: msg })}
            onBack={() => updateState({ step: 2 })}
          />
        )}
      </div>
    </div>
  );
}
