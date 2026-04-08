import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY', '');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (
      nodeEnv === 'production' &&
      (!secretKey ||
        secretKey.endsWith('_xxx') ||
        secretKey === 'sk_test_placeholder')
    ) {
      throw new Error('STRIPE_SECRET_KEY must be configured with a real value');
    }

    if (!secretKey) {
      throw new Error(
        'STRIPE_SECRET_KEY is required. Set it in your .env file.',
      );
    }

    this.stripe = new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
  }

  async createFxQuote(
    params: {
      from_currency: string;
      to_currency: string;
      from_amount: number;
      lock_duration: string;
    },
    idempotencyKey: string,
  ): Promise<{
    id: string;
    from_amount: number;
    from_currencies?: string[];
    to_amount: number;
    to_currency: string;
    expires_at?: string;
  }> {
    // FxQuotes is a beta/preview Stripe API — use rawRequest
    const response = await this.stripe.rawRequest(
      'POST',
      '/v1/fx_quotes',
      {
        'from_currencies[]': [params.from_currency],
        to_currency: params.to_currency,
        from_amount: params.from_amount,
        lock_duration: params.lock_duration,
      },
      { idempotencyKey },
    );

    return response as unknown as {
      id: string;
      from_amount: number;
      from_currencies?: string[];
      to_amount: number;
      to_currency: string;
      expires_at?: string;
    };
  }

  // --- Customers ---
  async createCustomer(
    params: Stripe.CustomerCreateParams,
    idempotencyKey: string,
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.create(params, { idempotencyKey });
  }

  async updateCustomerDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string | null,
  ): Promise<Stripe.Customer> {
    const params =
      paymentMethodId === null
        ? ({
            invoice_settings: { default_payment_method: null },
          } as unknown as Stripe.CustomerUpdateParams)
        : ({
            invoice_settings: { default_payment_method: paymentMethodId },
          } satisfies Stripe.CustomerUpdateParams);
    return this.stripe.customers.update(customerId, params);
  }

  // --- Setup Intents ---
  async createSetupIntent(
    customerId: string,
    idempotencyKey: string,
  ): Promise<Stripe.SetupIntent> {
    return this.stripe.setupIntents.create(
      {
        customer: customerId,
        usage: 'off_session',
        payment_method_types: ['card'],
      },
      { idempotencyKey },
    );
  }

  async listSetupIntents(
    customerId: string,
    limit = 10,
  ): Promise<Stripe.ApiList<Stripe.SetupIntent>> {
    return this.stripe.setupIntents.list({ customer: customerId, limit });
  }

  // --- Payment Intents ---
  async createPaymentIntent(
    params: Omit<Stripe.PaymentIntentCreateParams, 'currency'>,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create(
      { ...params, currency: 'gbp' },
      { idempotencyKey },
    );
  }

  // --- Checkout Sessions ---
  async createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
  ): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create(params, { idempotencyKey });
  }

  // --- Payment Methods ---
  async listPaymentMethods(
    customerId: string,
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.stripe.paymentMethods.list({ customer: customerId });
  }

  async retrievePaymentMethod(
    paymentMethodId: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.retrieve(paymentMethodId);
  }

  async detachPaymentMethod(
    paymentMethodId: string,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.detach(paymentMethodId, undefined, {
      idempotencyKey,
    });
  }

  // --- Subscriptions ---
  async listSubscriptions(
    customerId: string,
    limit = 10,
  ): Promise<Stripe.ApiList<Stripe.Subscription>> {
    return this.stripe.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit,
    });
  }

  async createBillingSubscription(params: {
    customerId: string;
    priceId: string;
    userId: string;
  }): Promise<Stripe.Subscription> {
    return this.stripe.subscriptions.create({
      customer: params.customerId,
      collection_method: 'charge_automatically',
      items: [{ price: params.priceId }],
      metadata: { userId: params.userId },
    });
  }

  // --- Billing / Usage ---
  async createMeterEvent(params: {
    eventName: string;
    customerId: string;
    value: number;
    identifier: string;
    timestamp: number;
  }): Promise<Stripe.Billing.MeterEvent> {
    return this.stripe.billing.meterEvents.create({
      event_name: params.eventName,
      payload: {
        stripe_customer_id: params.customerId,
        value: String(params.value),
      },
      identifier: params.identifier,
      timestamp: params.timestamp,
    });
  }

  async retrievePrice(priceId: string): Promise<Stripe.Price> {
    return this.stripe.prices.retrieve(priceId);
  }

  // Cached meter event name
  private cachedMeterEventName: string | null = null;

  async getBillingMeterEventName(priceId: string): Promise<string> {
    if (this.cachedMeterEventName) return this.cachedMeterEventName;
    const price = await this.stripe.prices.retrieve(priceId);
    const meterId = price.recurring?.meter;
    if (!meterId)
      throw new Error(
        `Price ${priceId} is not configured with a billing meter`,
      );
    const meter = await this.stripe.billing.meters.retrieve(meterId);
    this.cachedMeterEventName = meter.event_name;
    return this.cachedMeterEventName;
  }

  // --- Webhooks ---
  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  // --- Direct access (use sparingly) ---
  getClient(): Stripe {
    return this.stripe;
  }
}
