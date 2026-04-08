import {
  BillingSubscription,
  ChargeStatus,
  Payment,
  PaymentMethod,
  PaymentStatus,
  UsageCharge,
  User,
} from '@stripe-app/shared';
import { BillingSubscriptionStatus } from '@stripe-app/shared';

type NullableString = string | null;
type NullableNumber = number | string | null;
type NullableDate = Date | string | null;

function toNumber(value: NullableNumber): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === 'number' ? value : Number(value);
}

function toDate(value: NullableDate): Date | null {
  if (value === null || value === undefined) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function parseJson(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') return value as Record<string, unknown>;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

export function mapUser(row: Record<string, unknown>): User {
  return {
    id: row.ID as string,
    email: row.EMAIL as string,
    password: row.PASSWORD as string,
    name: row.USER_NAME as string,
    country: row.COUNTRY as string,
    currency: row.CURRENCY as string,
    stripeCustomerId: (row.STRIPE_CUSTOMER_ID as NullableString) || null,
    defaultPaymentMethodId:
      (row.DEFAULT_PAYMENT_METHOD_ID as NullableString) || null,
    monthlyManagementFee:
      toNumber(row.MONTHLY_MANAGEMENT_FEE as NullableNumber) ?? null,
    accountValue: toNumber(row.ACCOUNT_VALUE as NullableNumber) ?? null,
    paymentMethods: [],
    payments: [],
    usageCharges: [],
    billingSubscriptions: [],
    createdAt: toDate(row.CREATED_AT as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.UPDATED_AT as NullableDate) ?? new Date(0),
  } as User;
}

export function mapPaymentMethod(row: Record<string, unknown>): PaymentMethod {
  return {
    id: row.ID as string,
    userId: row.USER_ID as string,
    stripePaymentMethodId: row.STRIPE_PAYMENT_METHOD_ID as string,
    type: row.METHOD_TYPE as string,
    isDefault: Boolean(row.IS_DEFAULT),
    last4: (row.LAST4 as NullableString) ?? null,
    brand: (row.BRAND as NullableString) ?? null,
    expiryMonth: toNumber(row.EXPIRY_MONTH as NullableNumber) ?? null,
    expiryYear: toNumber(row.EXPIRY_YEAR as NullableNumber) ?? null,
    metadata: parseJson(row.METADATA),
    user: undefined as never,
    createdAt: toDate(row.CREATED_AT as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.UPDATED_AT as NullableDate) ?? new Date(0),
  } as PaymentMethod;
}

export function mapPayment(row: Record<string, unknown>): Payment {
  return {
    id: row.ID as string,
    userId: row.USER_ID as string,
    stripePaymentIntentId: (row.STRIPE_PAYMENT_INTENT_ID as NullableString) ?? null,
    stripeCheckoutSessionId:
      (row.STRIPE_CHECKOUT_SESSION_ID as NullableString) ?? null,
    amountGbp: Number(row.AMOUNT_GBP),
    amountUserCurrency: toNumber(row.AMOUNT_USER_CURRENCY as NullableNumber),
    userCurrency: (row.USER_CURRENCY as NullableString) ?? null,
    fxQuoteId: (row.FX_QUOTE_ID as NullableString) ?? null,
    status: row.STATUS as PaymentStatus,
    paymentMethodId: (row.PAYMENT_METHOD_ID as NullableString) ?? null,
    idempotencyKey: row.IDEMPOTENCY_KEY as string,
    metadata: parseJson(row.METADATA),
    user: undefined as never,
    createdAt: toDate(row.CREATED_AT as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.UPDATED_AT as NullableDate) ?? new Date(0),
  } as Payment;
}

export function mapUsageCharge(row: Record<string, unknown>): UsageCharge {
  return {
    id: row.ID as string,
    userId: row.USER_ID as string,
    stripeInvoiceId: (row.STRIPE_INVOICE_ID as NullableString) ?? null,
    stripeSubscriptionId: (row.STRIPE_SUBSCRIPTION_ID as NullableString) ?? null,
    stripeSubscriptionItemId:
      (row.STRIPE_SUBSCRIPTION_ITEM_ID as NullableString) ?? null,
    stripePaymentIntentId:
      (row.STRIPE_PAYMENT_INTENT_ID as NullableString) ?? null,
    amountGbp: Number(row.AMOUNT_GBP),
    description: (row.DESCRIPTION as NullableString) ?? null,
    billingPeriodStart: toDate(row.BILLING_PERIOD_START as NullableDate) ?? new Date(0),
    billingPeriodEnd: toDate(row.BILLING_PERIOD_END as NullableDate) ?? new Date(0),
    status: row.STATUS as ChargeStatus,
    idempotencyKey: row.IDEMPOTENCY_KEY as string,
    usageReportedAt: toDate(row.USAGE_REPORTED_AT as NullableDate),
    emailSentAt: toDate(row.EMAIL_SENT_AT as NullableDate) ?? null,
    user: undefined as never,
    createdAt: toDate(row.CREATED_AT as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.UPDATED_AT as NullableDate) ?? new Date(0),
  } as UsageCharge;
}

export function mapBillingSubscription(
  row: Record<string, unknown>,
): BillingSubscription {
  return {
    id: row.ID as string,
    userId: row.USER_ID as string,
    stripeSubscriptionId: row.STRIPE_SUBSCRIPTION_ID as string,
    stripeSubscriptionItemId: row.STRIPE_SUBSCRIPTION_ITEM_ID as string,
    stripePriceId: row.STRIPE_PRICE_ID as string,
    status: row.STATUS as BillingSubscriptionStatus,
    currentPeriodStart: toDate(row.CURRENT_PERIOD_START as NullableDate),
    currentPeriodEnd: toDate(row.CURRENT_PERIOD_END as NullableDate),
    cancelAtPeriodEnd: Boolean(row.CANCEL_AT_PERIOD_END),
    canceledAt: toDate(row.CANCELED_AT as NullableDate),
    user: undefined as never,
    createdAt: toDate(row.CREATED_AT as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.UPDATED_AT as NullableDate) ?? new Date(0),
  } as BillingSubscription;
}
