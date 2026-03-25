'use client';

import { useGetCurrentFeeQuery } from '@/lib/store/billing-api';

function formatPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

export function CurrentFee() {
  const { data, isLoading, isError } = useGetCurrentFeeQuery();

  if (isLoading) {
    return <div className="text-gray-500">Loading current fee...</div>;
  }

  if (isError) {
    return <div className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">Failed to load current fee</div>;
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-sm font-medium uppercase tracking-wider text-gray-500">Current Monthly Fee</h2>
      <p className="mt-2 text-3xl font-semibold text-gray-900">
        {data?.monthlyManagementFee != null
          ? <>&pound;{formatPence(data.monthlyManagementFee)}</>
          : <span className="text-base text-gray-500">No fee configured</span>
        }
      </p>
      {data?.accountValue != null && (
        <p className="mt-2 text-sm text-gray-500">
          Account Value: &pound;{data.accountValue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </p>
      )}
    </div>
  );
}
