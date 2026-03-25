'use client';

import type { PaymentMethodResponse } from '@stripe-app/shared';
import { PaymentMethodIcon } from './payment-method-icon';

interface PaymentMethodCardProps {
  method: PaymentMethodResponse;
  onSetDefault: () => void;
  onRemove: () => void;
}

export function PaymentMethodCard({ method, onSetDefault, onRemove }: PaymentMethodCardProps) {
  const label = getMethodLabel(method);

  return (
    <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <PaymentMethodIcon type={method.type} brand={method.brand} />
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-900">{label}</span>
            {method.isDefault && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                Default
              </span>
            )}
          </div>
          {method.expiryMonth && method.expiryYear && (
            <p className="text-xs text-gray-500">
              Expires {String(method.expiryMonth).padStart(2, '0')}/{method.expiryYear}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!method.isDefault && (
          <button
            onClick={onSetDefault}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
          >
            Set Default
          </button>
        )}
        <button
          onClick={onRemove}
          className="rounded-md px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
        >
          Remove
        </button>
      </div>
    </div>
  );
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
