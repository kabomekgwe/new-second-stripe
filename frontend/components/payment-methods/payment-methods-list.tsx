'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useGetPaymentMethodsQuery,
  useGetAvailableMethodTypesQuery,
  useSetDefaultMethodMutation,
  useDeleteMethodMutation,
} from '@/lib/store/payment-methods-api';
import { PaymentMethodCard } from './payment-method-card';
import { AvailableTypesGrid } from './available-types-grid';

export function PaymentMethodsList() {
  const { data: savedMethods, isLoading: methodsLoading, isError: methodsError } = useGetPaymentMethodsQuery();
  const { data: availableTypes, isLoading: typesLoading } = useGetAvailableMethodTypesQuery();
  const [setDefaultMethod] = useSetDefaultMethodMutation();
  const [deleteMethod] = useDeleteMethodMutation();
  const [error, setError] = useState('');

  const loading = methodsLoading || typesLoading;

  async function handleSetDefault(id: string) {
    try {
      await setDefaultMethod(id).unwrap();
    } catch {
      setError('Failed to set default payment method');
    }
  }

  async function handleRemove(id: string) {
    try {
      await deleteMethod(id).unwrap();
    } catch {
      setError('Failed to remove payment method');
    }
  }

  if (loading) {
    return <div className="text-gray-500">Loading payment methods...</div>;
  }

  return (
    <div className="space-y-8">
      {(error || methodsError) && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Failed to load payment methods'}
        </div>
      )}

      {/* Saved Payment Methods */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Your Payment Methods</h2>
          <Link
            href="/payment-methods/add"
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Add Payment Method
          </Link>
        </div>

        {!savedMethods || savedMethods.length === 0 ? (
          <p className="mt-4 text-sm text-gray-500">
            No payment methods saved yet. Add one to get started.
          </p>
        ) : (
          <div className="mt-4 grid gap-3">
            {savedMethods.map((method) => (
              <PaymentMethodCard
                key={method.id}
                method={method}
                onSetDefault={() => handleSetDefault(method.id)}
                onRemove={() => handleRemove(method.id)}
              />
            ))}
          </div>
        )}
      </section>

      {/* Available Payment Method Types */}
      <AvailableTypesGrid types={availableTypes || []} />
    </div>
  );
}
