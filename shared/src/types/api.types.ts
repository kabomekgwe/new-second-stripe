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

export interface AvailablePaymentMethodType {
  type: string;
  label: string;
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

export interface CreatePaymentResponse {
  clientSecret: string;
  paymentIntentId: string;
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
  status: string;
  createdAt: string;
}

// Billing
export interface UsageChargeResponse {
  id: string;
  amountGbp: number;
  description: string | null;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  status: string;
  stripePaymentIntentId: string | null;
  createdAt: string;
}

// Generic
export interface ApiError {
  statusCode: number;
  message: string;
  error?: string;
}
