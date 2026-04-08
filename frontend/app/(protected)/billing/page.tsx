import { CurrentFee } from '@/components/billing/current-fee';
import { BillingHistory } from '@/components/billing/billing-history';
import { BillingTrigger } from '@/components/billing/billing-trigger';

export default function BillingPage() {
  return (
    <div>
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          View your current fee and billing history.
        </p>
      </div>
      <div className="mt-6 space-y-6">
        <CurrentFee />
        <BillingTrigger />
        <BillingHistory />
      </div>
    </div>
  );
}
