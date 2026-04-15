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

export enum BillingSubscriptionStatus {
  ACTIVE = 'active',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  TRIALING = 'trialing',
  PAUSED = 'paused',
}

export enum WebhookEventStatus {
  PROCESSING = 'processing',
  PROCESSED = 'processed',
  FAILED = 'failed',
}

export enum PaymentMethodType {
  CARD = 'card',
  LINK = 'link',
  AMAZON_PAY = 'amazon_pay',
  REVOLUT_PAY = 'revolut_pay',
  PAY_BY_BANK = 'pay_by_bank',
  BANCONTACT = 'bancontact',
  BLIK = 'blik',
  EPS = 'eps',
  IDEAL = 'ideal',
  P24 = 'p24',
  TWINT = 'twint',
  US_BANK_ACCOUNT = 'us_bank_account',
  BACS_DEBIT = 'bacs_debit',
  SEPA_DEBIT = 'sepa_debit',
}

export const SUPPORTED_SAVED_PAYMENT_METHOD_TYPES = [
  PaymentMethodType.CARD,
] as const;

export type SupportedSavedPaymentMethodType =
  (typeof SUPPORTED_SAVED_PAYMENT_METHOD_TYPES)[number];

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  card: 'Card',
  link: 'Link',
  amazon_pay: 'Amazon Pay',
  revolut_pay: 'Revolut Pay',
  pay_by_bank: 'Pay by Bank',
  bancontact: 'Bancontact',
  blik: 'BLIK',
  eps: 'EPS',
  ideal: 'iDEAL',
  p24: 'Przelewy24',
  twint: 'TWINT',
  us_bank_account: 'ACH Direct Debit',
  bacs_debit: 'Bacs Direct Debit',
  sepa_debit: 'SEPA Direct Debit',
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
  INVOICE_FINALIZED: 'invoice.finalized',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_PAYMENT_FAILED: 'invoice.payment_failed',
  CUSTOMER_SUBSCRIPTION_CREATED: 'customer.subscription.created',
  CUSTOMER_SUBSCRIPTION_UPDATED: 'customer.subscription.updated',
  CUSTOMER_SUBSCRIPTION_DELETED: 'customer.subscription.deleted',
} as const;
