'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api-client';
import type { PaymentMethodResponse, AvailablePaymentMethodType } from '@stripe-app/shared';
import { PaymentMethodCard } from './payment-method-card';
import { AddPaymentMethodModal } from './add-payment-method-modal';

export function PaymentMethodsList() {
  const [savedMethods, setSavedMethods] = useState<PaymentMethodResponse[]>([]);
  const [availableTypes, setAvailableTypes] = useState<AvailablePaymentMethodType[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const [methods, types] = await Promise.all([
        api.get<PaymentMethodResponse[]>('/payment-methods'),
        api.get<AvailablePaymentMethodType[]>('/payment-methods/available'),
      ]);
      setSavedMethods(methods);
      setAvailableTypes(types);
    } catch {
      setError('Failed to load payment methods');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function handleSetDefault(id: string) {
    try {
      await api.post(`/payment-methods/${id}/default`);
      await fetchData();
    } catch {
      setError('Failed to set default payment method');
    }
  }

  async function handleRemove(id: string) {
    try {
      await api.delete(`/payment-methods/${id}`);
      await fetchData();
    } catch {
      setError('Failed to remove payment method');
    }
  }

  function handleAddSuccess() {
    setShowAddModal(false);
    fetchData();
  }

  if (loading) {
    return <div className="text-gray-500">Loading payment methods...</div>;
  }

  return (
    <div className="space-y-8">
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* Saved Payment Methods */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Your Payment Methods</h2>
          <button
            onClick={() => setShowAddModal(true)}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            Add Payment Method
          </button>
        </div>

        {savedMethods.length === 0 ? (
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
      <section>
        <h2 className="text-lg font-medium text-gray-900">Available Payment Methods</h2>
        <p className="mt-1 text-sm text-gray-500">
          Payment methods enabled on this account.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {availableTypes.map((pm) => (
            <div
              key={pm.type}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
            >
              <img
                src={`/icons/payment-methods/${pm.type.replace('_', '-')}.svg`}
                alt={pm.label}
                width={32}
                height={22}
                className="flex-shrink-0"
              />
              <span className="text-sm font-medium text-gray-700">{pm.label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Add Payment Method Modal */}
      {showAddModal && (
        <AddPaymentMethodModal
          onClose={() => setShowAddModal(false)}
          onSuccess={handleAddSuccess}
        />
      )}
    </div>
  );
}
