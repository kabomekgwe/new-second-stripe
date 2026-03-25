import { PaymentForm } from '@/components/payments/payment-form';

export default function NewPaymentPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Make a Payment</h1>
      <p className="mt-1 text-sm text-gray-500">
        Send a payment in 3 simple steps.
      </p>
      <div className="mt-6">
        <PaymentForm />
      </div>
    </div>
  );
}
