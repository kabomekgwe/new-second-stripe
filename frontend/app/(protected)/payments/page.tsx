import Link from 'next/link';
import { PaymentHistory } from '@/components/payments/payment-history';

export default function PaymentsPage() {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Payments</h1>
          <p className="mt-1 text-sm text-gray-500">
            View your payment history and make new payments.
          </p>
        </div>
        <Link
          href="/payments/new"
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          Make a Payment
        </Link>
      </div>
      <div className="mt-6">
        <PaymentHistory />
      </div>
    </div>
  );
}
