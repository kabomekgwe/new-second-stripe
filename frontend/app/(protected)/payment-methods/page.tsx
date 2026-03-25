import { PaymentMethodsList } from '@/components/payment-methods/payment-methods-list';

export default function PaymentMethodsPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-gray-900">Payment Methods</h1>
      <p className="mt-1 text-sm text-gray-500">
        Manage your payment methods and set a default for future payments.
      </p>
      <div className="mt-6">
        <PaymentMethodsList />
      </div>
    </div>
  );
}
