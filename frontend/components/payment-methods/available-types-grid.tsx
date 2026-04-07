import { PaymentMethodIcon } from './payment-method-icon';
import type { AvailablePaymentMethodType } from '@stripe-app/shared';

interface AvailableTypesGridProps {
  types: AvailablePaymentMethodType[];
  countryCode: string | null;
}

export function AvailableTypesGrid({
  types,
  countryCode,
}: AvailableTypesGridProps) {
  const groupedTypes = types.reduce<Record<string, AvailablePaymentMethodType[]>>(
    (groups, paymentMethod) => {
      if (!groups[paymentMethod.category]) {
        groups[paymentMethod.category] = [];
      }
      groups[paymentMethod.category].push(paymentMethod);
      return groups;
    },
    {},
  );

  const orderedCategories = [
    'Card',
    'Bank Redirect',
    'Bank debit',
    'Bank transfers',
  ];

  return (
    <section>
      <h2 className="text-lg font-medium text-gray-900">Available In Your Region</h2>
      <p className="mt-1 text-sm text-gray-500">
        {countryCode
          ? `Based on your account country: ${countryCode.toUpperCase()}. Cards are always shown.`
          : 'Payment methods available in your account region. Cards are always shown.'}
      </p>
      <div className="mt-6 space-y-6">
        {orderedCategories
          .filter((category) => (groupedTypes[category] ?? []).length > 0)
          .map((category) => (
            <section key={category}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
                {category}
              </h3>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {groupedTypes[category].map((pm) => (
                  <div
                    key={`${pm.type}-${pm.label}`}
                    className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
                  >
                    <PaymentMethodIcon
                      type={pm.type}
                      size={32}
                      className="flex-shrink-0"
                    />
                    <span className="text-sm font-medium text-gray-700">
                      {pm.label}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))}
      </div>
    </section>
  );
}
