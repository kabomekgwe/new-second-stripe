import type { PaymentMethodResponse } from '@/lib/shared';

export function formatPence(pence: number): string {
  return (pence / 100).toFixed(2);
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

export function getMethodLabel(method: PaymentMethodResponse): string {
  if (method.type === 'card' && method.brand) {
    const brand = method.brand.charAt(0).toUpperCase() + method.brand.slice(1);
    return method.last4 ? `${brand} ending in ${method.last4}` : brand;
  }

  if (method.last4) {
    return `${method.type} ending in ${method.last4}`;
  }

  return method.type;
}
