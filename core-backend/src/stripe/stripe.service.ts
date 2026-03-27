import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

type FxQuoteResponse = {
  id: string;
  from_amount: number;
  from_currencies?: string[];
  to_amount: number;
  to_currency: string;
  expires_at?: string;
};

@Injectable()
export class StripeService {
  private stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.get<string>('STRIPE_SECRET_KEY', '');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (nodeEnv === 'production' && secretKey.endsWith('_xxx')) {
      throw new Error('STRIPE_SECRET_KEY must be configured with a real value');
    }

    this.stripe = new Stripe(
      secretKey,
      { apiVersion: '2026-02-25.clover' },
    );
  }

  async createCustomer(
    params: Stripe.CustomerCreateParams,
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
      {
        customer: customerId,
        usage: 'off_session',
        automatic_payment_methods: { enabled: true },
      },
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
  ): Promise<FxQuoteResponse> {
    // FxQuotes is a beta/preview Stripe API - use raw request
    return (this.stripe as Stripe & {
      fxQuotes: {
        create(
          params: {
            from_currencies: string[];
            to_currency: string;
            from_amount: number;
            lock_duration: string;
          },
          options: { idempotencyKey: string },
        ): Promise<FxQuoteResponse>;
      };
    }).fxQuotes.create(
      {
        from_currencies: [params.from_currency],
        to_currency: params.to_currency,
        from_amount: params.from_amount,
        lock_duration: params.lock_duration,
      },
      { idempotencyKey },
    );
  }

  async createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
  ): Promise<Stripe.Checkout.Session> {
    return this.stripe.checkout.sessions.create(params, { idempotencyKey });
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

  async updateCustomerDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string | null,
  ): Promise<Stripe.Customer> {
    const params =
      paymentMethodId === null
        ? ({
            invoice_settings: {
              default_payment_method: null,
            },
          } as unknown as Stripe.CustomerUpdateParams)
        : ({
            invoice_settings: {
              default_payment_method: paymentMethodId,
            },
          } satisfies Stripe.CustomerUpdateParams);

    return this.stripe.customers.update(customerId, params);
  }

  async listSetupIntents(
    customerId: string,
    limit = 10,
  ): Promise<Stripe.ApiList<Stripe.SetupIntent>> {
    return this.stripe.setupIntents.list({
      customer: customerId,
      limit,
    });
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
