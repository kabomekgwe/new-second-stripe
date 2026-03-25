import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    this.stripe = new Stripe(
      this.configService.get<string>('STRIPE_SECRET_KEY', ''),
      { apiVersion: '2026-02-25.clover' },
    );
  }

  async createCustomer(
    params: { email: string; name: string; metadata?: Stripe.MetadataParam },
    idempotencyKey: string,
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.create(params, {
      idempotencyKey,
    });
  }

  async createSetupIntent(
    customerId: string,
    idempotencyKey: string,
  ): Promise<Stripe.SetupIntent> {
    return this.stripe.setupIntents.create(
      { customer: customerId, usage: 'off_session' },
      { idempotencyKey },
    );
  }

  async createPaymentIntent(
    params: Omit<Stripe.PaymentIntentCreateParams, 'currency'>,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.stripe.paymentIntents.create(
      {
        ...params,
        currency: 'gbp',
      },
      { idempotencyKey },
    );
  }

  async createFxQuote(
    params: {
      from_currency: string;
      to_currency: string;
      from_amount: number;
      lock_duration: string;
    },
    idempotencyKey: string,
  ): Promise<any> {
    // FxQuotes is a beta/preview Stripe API - use raw request
    return (this.stripe as any).fxQuotes.create(
      {
        from_currencies: [params.from_currency],
        to_currency: params.to_currency,
        from_amount: params.from_amount,
        lock_duration: params.lock_duration,
      },
      { idempotencyKey },
    );
  }

  async listPaymentMethods(
    customerId: string,
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.stripe.paymentMethods.list({ customer: customerId });
  }

  async detachPaymentMethod(
    paymentMethodId: string,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.detach(paymentMethodId, undefined, {
      idempotencyKey,
    });
  }

  async getPaymentMethodConfigurations(): Promise<
    Stripe.ApiList<Stripe.PaymentMethodConfiguration>
  > {
    return this.stripe.paymentMethodConfigurations.list();
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  getStripeInstance(): Stripe {
    return this.stripe;
  }
}
