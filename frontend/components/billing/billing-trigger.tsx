'use client';

import { useState } from 'react';
import {
  useTriggerBillingMutation,
  useTriggerAllBillingMutation,
} from '@/lib/store/billing-api';
import { getReadableErrorMessage } from '@/lib/error-utils';

export function BillingTrigger() {
  const [triggerBilling, { isLoading: triggeringOne }] = useTriggerBillingMutation();
  const [triggerAll, { isLoading: triggeringAll }] = useTriggerAllBillingMutation();
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function handleTriggerMine() {
    setMessage(null);
    try {
      const result = await triggerBilling().unwrap();
      if ('message' in result) {
        setMessage({ type: 'error', text: (result as { message: string }).message });
      } else {
        setMessage({ type: 'success', text: `Charge created: ${result.amountGbp}p (${result.status})` });
      }
    } catch (err) {
      setMessage({ type: 'error', text: getReadableErrorMessage(err, 'Failed to trigger billing') });
    }
  }

  async function handleTriggerAll() {
    setMessage(null);
    try {
      const result = await triggerAll().unwrap();
      setMessage({
        type: 'success',
        text: `Done: ${result.succeeded} succeeded, ${result.failed} failed, ${result.skipped} skipped (${result.total} total)`,
      });
    } catch (err) {
      setMessage({ type: 'error', text: getReadableErrorMessage(err, 'Failed to trigger billing') });
    }
  }

  const busy = triggeringOne || triggeringAll;

  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-6">
      <h3 className="text-sm font-medium text-amber-800">Test Tools</h3>
      <p className="mt-1 text-xs text-amber-600">
        Dev only — triggers billing immediately instead of waiting for the scheduled run.
      </p>

      <div className="mt-4 flex gap-3">
        <button
          onClick={handleTriggerMine}
          disabled={busy}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50 transition-colors"
        >
          {triggeringOne ? 'Triggering...' : 'Trigger My Billing'}
        </button>
        <button
          onClick={handleTriggerAll}
          disabled={busy}
          className="rounded-md border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 transition-colors"
        >
          {triggeringAll ? 'Triggering...' : 'Trigger All Users'}
        </button>
      </div>

      {message && (
        <div className={`mt-3 rounded-md px-3 py-2 text-sm ${
          message.type === 'success'
            ? 'bg-green-50 text-green-700'
            : 'bg-red-50 text-red-700'
        }`}>
          {message.text}
        </div>
      )}
    </div>
  );
}
