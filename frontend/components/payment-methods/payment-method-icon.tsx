import Image from 'next/image';

const ICON_MAP: Record<string, string> = {
  visa: '/icons/payment-methods/visa.svg',
  mastercard: '/icons/payment-methods/mastercard.svg',
  amex: '/icons/payment-methods/amex.svg',
  discover: '/icons/payment-methods/discover.svg',
  diners: '/icons/payment-methods/diners.svg',
  jcb: '/icons/payment-methods/jcb.svg',
  unionpay: '/icons/payment-methods/unionpay.svg',
  bacs_debit: '/icons/payment-methods/bacs-debit.svg',
  sepa_debit: '/icons/payment-methods/sepa-debit.svg',
  ideal: '/icons/payment-methods/ideal.svg',
  bancontact: '/icons/payment-methods/bancontact.svg',
  giropay: '/icons/payment-methods/giropay.svg',
  sofort: '/icons/payment-methods/sofort.svg',
  eps: '/icons/payment-methods/eps.svg',
  p24: '/icons/payment-methods/p24.svg',
  klarna: '/icons/payment-methods/klarna.svg',
  afterpay_clearpay: '/icons/payment-methods/afterpay.svg',
  link: '/icons/payment-methods/link.svg',
  apple_pay: '/icons/payment-methods/apple-pay.svg',
  google_pay: '/icons/payment-methods/google-pay.svg',
};

interface PaymentMethodIconProps {
  type: string;
  brand?: string | null;
  size?: number;
  className?: string;
}

export function PaymentMethodIcon({ type, brand, size = 40, className }: PaymentMethodIconProps) {
  const key = type === 'card' && brand ? brand.toLowerCase() : type;
  const src = ICON_MAP[key] || '/icons/payment-methods/generic.svg';

  return (
    <Image
      src={src}
      alt={key}
      width={size}
      height={Math.round(size * 0.7)}
      className={className}
    />
  );
}
