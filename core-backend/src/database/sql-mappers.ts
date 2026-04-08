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
    id: row.id as string,
    email: row.email as string,
    password: row.password as string,
    name: row.name as string,
    country: row.country as string,
    currency: row.currency as string,
    stripeCustomerId: (row.stripeCustomerId as NullableString) ?? null,
    defaultPaymentMethodId:
      (row.defaultPaymentMethodId as NullableString) ?? null,
    monthlyManagementFee:
      toNumber(row.monthlyManagementFee as NullableNumber) ?? null,
    accountValue: toNumber(row.accountValue as NullableNumber) ?? null,
    paymentMethods: [],
    payments: [],
    usageCharges: [],
    billingSubscriptions: [],
    createdAt: toDate(row.createdAt as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.updatedAt as NullableDate) ?? new Date(0),
  } as User;
}

export function mapPaymentMethod(row: Record<string, unknown>): PaymentMethod {
  return {
    id: row.id as string,
    userId: row.userId as string,
    stripePaymentMethodId: row.stripePaymentMethodId as string,
    type: row.type as string,
    isDefault: Boolean(row.isDefault),
    last4: (row.last4 as NullableString) ?? null,
    brand: (row.brand as NullableString) ?? null,
    expiryMonth: toNumber(row.expiryMonth as NullableNumber) ?? null,
    expiryYear: toNumber(row.expiryYear as NullableNumber) ?? null,
    metadata: parseJson(row.metadata),
    user: undefined as never,
    createdAt: toDate(row.createdAt as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.updatedAt as NullableDate) ?? new Date(0),
  } as PaymentMethod;
}

export function mapPayment(row: Record<string, unknown>): Payment {
  return {
    id: row.id as string,
    userId: row.userId as string,
    stripePaymentIntentId: (row.stripePaymentIntentId as NullableString) ?? null,
    stripeCheckoutSessionId:
      (row.stripeCheckoutSessionId as NullableString) ?? null,
    amountGbp: Number(row.amountGbp),
    amountUserCurrency: toNumber(row.amountUserCurrency as NullableNumber),
    userCurrency: (row.userCurrency as NullableString) ?? null,
    fxQuoteId: (row.fxQuoteId as NullableString) ?? null,
    status: row.status as PaymentStatus,
    paymentMethodId: (row.paymentMethodId as NullableString) ?? null,
    idempotencyKey: row.idempotencyKey as string,
    metadata: parseJson(row.metadata),
    user: undefined as never,
    createdAt: toDate(row.createdAt as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.updatedAt as NullableDate) ?? new Date(0),
  } as Payment;
}

export function mapUsageCharge(row: Record<string, unknown>): UsageCharge {
  return {
    id: row.id as string,
    userId: row.userId as string,
    stripeInvoiceId: (row.stripeInvoiceId as NullableString) ?? null,
    stripeSubscriptionId: (row.stripeSubscriptionId as NullableString) ?? null,
    stripeSubscriptionItemId:
      (row.stripeSubscriptionItemId as NullableString) ?? null,
    stripePaymentIntentId:
      (row.stripePaymentIntentId as NullableString) ?? null,
    amountGbp: Number(row.amountGbp),
    description: (row.description as NullableString) ?? null,
    billingPeriodStart: toDate(row.billingPeriodStart as NullableDate) ?? new Date(0),
    billingPeriodEnd: toDate(row.billingPeriodEnd as NullableDate) ?? new Date(0),
    status: row.status as ChargeStatus,
    idempotencyKey: row.idempotencyKey as string,
    usageReportedAt: toDate(row.usageReportedAt as NullableDate),
    emailSentAt: toDate(row.emailSentAt as NullableDate) ?? null,
    user: undefined as never,
    createdAt: toDate(row.createdAt as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.updatedAt as NullableDate) ?? new Date(0),
  } as UsageCharge;
}

export function mapBillingSubscription(
  row: Record<string, unknown>,
): BillingSubscription {
  return {
    id: row.id as string,
    userId: row.userId as string,
    stripeSubscriptionId: row.stripeSubscriptionId as string,
    stripeSubscriptionItemId: row.stripeSubscriptionItemId as string,
    stripePriceId: row.stripePriceId as string,
    status: row.status as BillingSubscriptionStatus,
    currentPeriodStart: toDate(row.currentPeriodStart as NullableDate),
    currentPeriodEnd: toDate(row.currentPeriodEnd as NullableDate),
    cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd),
    canceledAt: toDate(row.canceledAt as NullableDate),
    user: undefined as never,
    createdAt: toDate(row.createdAt as NullableDate) ?? new Date(0),
    updatedAt: toDate(row.updatedAt as NullableDate) ?? new Date(0),
  } as BillingSubscription;
}
