'use client';

import { useEffect } from 'react';
import { useGetPaymentMethodsQuery } from '@/lib/store/payment-methods-api';
import type { PaymentMethodResponse } from '@stripe-app/shared';
import { PaymentMethodIcon } from '@/components/payment-methods/payment-method-icon';

interface StepSelectMethodProps {
  selectedId: string;
  onSelect: (id: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function methodLabel(method: PaymentMethodResponse): string {
  if (method.type === 'card' && method.brand) {
    const brand = method.brand.charAt(0).toUpperCase() + method.brand.slice(1);
    return `${brand} ending in ${method.last4}`;
  }
  return `${method.type.replace(/_/g, ' ')} ending in ${method.last4 || '****'}`;
}

export function StepSelectMethod({ selectedId, onSelect, onBack, onNext }: StepSelectMethodProps) {
  const { data: methods, isLoading, isError } = useGetPaymentMethodsQuery();

  useEffect(() => {
    if (methods && !selectedId) {
      const defaultMethod = methods.find((m) => m.isDefault);
      if (defaultMethod) onSelect(defaultMethod.id);
      else if (methods.length > 0) onSelect(methods[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methods]);

  if (isLoading) {
    return <div className="text-gray-500">Loading payment methods...</div>;
  }

  if (isError) {
    return <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load payment methods</div>;
  }

  if (!methods || methods.length === 0) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          No payment methods saved. Please add a payment method first.
        </p>
        <button
          onClick={onBack}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-medium text-gray-900">Select Payment Method</h2>
        <p className="mt-1 text-sm text-gray-500">Choose how you want to pay.</p>
      </div>

      <div className="space-y-2">
        {methods.map((method) => (
          <label
            key={method.id}
            className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors ${
              selectedId === method.id
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:bg-gray-50'
            }`}
          >
            <input
              type="radio"
              name="payment-method"
              value={method.id}
              checked={selectedId === method.id}
              onChange={() => onSelect(method.id)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500"
            />
            <PaymentMethodIcon type={method.type} brand={method.brand} size={32} />
            <div className="flex-1">
              <span className="text-sm font-medium text-gray-900">{methodLabel(method)}</span>
              {method.isDefault && (
                <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">Default</span>
              )}
            </div>
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-md border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          disabled={!selectedId}
          className="flex-1 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
