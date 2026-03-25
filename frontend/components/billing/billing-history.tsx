'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api-client';
import type { UsageChargeResponse } from '@stripe-app/shared';

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-700',
  processing: 'bg-blue-100 text-blue-700',
  pending: 'bg-yellow-100 text-yellow-700',
  failed: 'bg-red-100 text-red-700',
};

function formatPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

function formatBillingPeriod(start: string): string {
  return new Date(start).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export function BillingHistory() {
  const [charges, setCharges] = useState<UsageChargeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<UsageChargeResponse[]>('/billing')
      .then(setCharges)
      .catch(() => setError('Failed to load billing history'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="text-gray-500">Loading billing history...</div>;
  }

  if (error) {
    return <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  }

  if (charges.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-gray-500">No billing charges yet.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Period</th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Amount</th>
            <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {charges.map((charge) => (
            <tr key={charge.id}>
              <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-900">
                {formatBillingPeriod(charge.billingPeriodStart)}
              </td>
              <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900">
                &pound;{formatPence(charge.amountGbp)}
              </td>
              <td className="whitespace-nowrap px-6 py-4">
                <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[charge.status] || 'bg-gray-100 text-gray-600'}`}>
                  {formatStatus(charge.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
