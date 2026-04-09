import {
  BillingSubscriptionStatus,
  ChargeStatus,
  PaymentStatus,
} from './stripe.types';

// Auth
export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  country: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateProfileRequest {
  country?: string;
}

export interface UserResponse {
  id: string;
  email: string;
  name: string;
  country: string;
  currency: string;
  stripeCustomerId: string | null;
  defaultPaymentMethodId: string | null;
  monthlyManagementFee: number | null;
  accountValue: number | null;
}

export interface BillingSubscriptionResponse {
  id: string;
  stripeSubscriptionId: string;
  stripeSubscriptionItemId: string;
  status: BillingSubscriptionStatus;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

// Payment Methods
export interface PaymentMethodResponse {
  id: string;
  stripePaymentMethodId: string;
  type: string;
  isDefault: boolean;
  last4: string | null;
  brand: string | null;
  expiryMonth: number | null;
  expiryYear: number | null;
}

export interface SetupIntentResponse {
  clientSecret: string;
}

// FX Quotes
export interface FxQuoteRequest {
  amountGbp: number;
}

export interface FxQuoteResponse {
  fromAmount: number;
  fromCurrency: string;
  toAmount: number;
  toCurrency: string;
  quoteId: string;
  expiresAt: string;
}

// Payments
export interface CreatePaymentRequest {
  amountGbp: number;
  paymentMethodId: string;
  fxQuoteId?: string;
}

export type PaymentIntentClientStatus =
  | 'requires_payment_method'
  | 'requires_confirmation'
  | 'requires_action'
  | 'requires_capture'
  | 'processing'
  | 'succeeded'
  | 'canceled';

export interface CreatePaymentResponse {
  clientSecret: string;
  paymentIntentId: string;
  status: PaymentIntentClientStatus;
  requiresAction: boolean;
}

// Checkout Sessions (Adaptive Pricing)
export interface CreateCheckoutSessionRequest {
  amountGbp: number; // in pence
}

export interface CreateCheckoutSessionResponse {
  clientSecret: string;
  sessionId: string;
}

export interface PaymentResponse {
  id: string;
  stripePaymentIntentId: string;
  amountGbp: number;
  amountUserCurrency: number | null;
  userCurrency: string | null;
  status: PaymentStatus;
  createdAt: string;
}

// Billing
export interface UsageChargeResponse {
  id: string;
  amountGbp: number;
  description: string | null;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  status: ChargeStatus;
  stripeInvoiceId: string | null;
  stripeSubscriptionId: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string;
}

// Generic
export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}
