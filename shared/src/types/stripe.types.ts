export enum PaymentStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum ChargeStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  PAID = 'paid',
  FAILED = 'failed',
}

export enum WebhookEventStatus {
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export enum PaymentMethodType {
  CARD = 'card',
  BACS_DEBIT = 'bacs_debit',
  SEPA_DEBIT = 'sepa_debit',
  IDEAL = 'ideal',
  BANCONTACT = 'bancontact',
  GIROPAY = 'giropay',
  SOFORT = 'sofort',
  EPS = 'eps',
  P24 = 'p24',
  KLARNA = 'klarna',
  AFTERPAY_CLEARPAY = 'afterpay_clearpay',
  LINK = 'link',
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  bacs_debit: 'Bacs Direct Debit',
  sepa_debit: 'SEPA Direct Debit',
  ideal: 'iDEAL',
  bancontact: 'Bancontact',
  giropay: 'Giropay',
  sofort: 'Sofort',
  eps: 'EPS',
  p24: 'Przelewy24',
  klarna: 'Klarna',
  afterpay_clearpay: 'Afterpay / Clearpay',
  link: 'Link',
  apple_pay: 'Apple Pay',
  google_pay: 'Google Pay',
};

export const STRIPE_WEBHOOK_EVENTS = {
  PAYMENT_INTENT_SUCCEEDED: 'payment_intent.succeeded',
  PAYMENT_INTENT_FAILED: 'payment_intent.payment_failed',
  SETUP_INTENT_SUCCEEDED: 'setup_intent.succeeded',
  PAYMENT_METHOD_ATTACHED: 'payment_method.attached',
  PAYMENT_METHOD_DETACHED: 'payment_method.detached',
  CHECKOUT_SESSION_COMPLETED: 'checkout.session.completed',
  CHECKOUT_SESSION_EXPIRED: 'checkout.session.expired',
  CHECKOUT_SESSION_ASYNC_PAYMENT_SUCCEEDED:
    'checkout.session.async_payment_succeeded',
  CHECKOUT_SESSION_ASYNC_PAYMENT_FAILED:
    'checkout.session.async_payment_failed',
} as const;
