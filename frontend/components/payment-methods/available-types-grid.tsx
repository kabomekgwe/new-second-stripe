import { PaymentMethodIcon } from './payment-method-icon';

interface AvailableType {
  type: string;
  label: string;
}

interface AvailableTypesGridProps {
  types: AvailableType[];
}

export function AvailableTypesGrid({ types }: AvailableTypesGridProps) {
  return (
    <section>
      <h2 className="text-lg font-medium text-gray-900">Available Payment Methods</h2>
      <p className="mt-1 text-sm text-gray-500">
        Payment methods enabled on this account.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {types.map((pm) => (
          <div
            key={pm.type}
            className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3"
          >
            <PaymentMethodIcon type={pm.type} size={32} className="flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700">{pm.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
