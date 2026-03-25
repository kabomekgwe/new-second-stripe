'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { PaymentResponse } from '@stripe-app/shared';

const STATUS_STYLES: Record<string, string> = {
  succeeded: 'bg-green-100 text-green-700',
  processing: 'bg-yellow-100 text-yellow-700',
  requires_payment_method: 'bg-red-100 text-red-700',
  requires_action: 'bg-orange-100 text-orange-700',
  canceled: 'bg-gray-100 text-gray-600',
};

function formatPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function PaymentHistory() {
  const [payments, setPayments] = useState<PaymentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<PaymentResponse[]>('/payments')
      .then(setPayments)
      .catch(() => setError('Failed to load payments'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-500">Loading payments...</div>;
  }

  if (error) {
    return <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  if (payments.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-gray-500">No payments yet. Make your first payment to get started.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Date</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {payments.map((payment) => (
            <tr key={payment.id}>
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                &pound;{formatPence(payment.amountGbp)}
                {payment.userCurrency && payment.userCurrency !== 'gbp' && payment.amountUserCurrency && (
                  <span className="ml-2 text-xs text-gray-500">
                    ({formatPence(payment.amountUserCurrency)} {payment.userCurrency.toUpperCase()})
                  </span>
                )}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[payment.status] || 'bg-gray-100 text-gray-600'}`}>
                  {formatStatus(payment.status)}
                </span>
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500">
                {new Date(payment.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
