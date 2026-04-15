import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe-client.token';

@Injectable()
export class StripePaymentMethodsService {
  private readonly paymentMethodMode: 'auto' | 'explicit';

  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripe: Stripe,
    private readonly configService: ConfigService,
  ) {
    this.paymentMethodMode =
      this.configService.get<string>('STRIPE_PAYMENT_METHOD_MODE', 'auto') ===
      'explicit'
        ? 'explicit'
        : 'auto';
  }

  createSetupIntent(
    customerId: string,
    idempotencyKey: string,
    paymentMethodTypes?: string[],
  ): Promise<Stripe.SetupIntent> {
    const useExplicit =
      this.paymentMethodMode === 'explicit' &&
      paymentMethodTypes &&
      paymentMethodTypes.length > 0;

    return this.stripe.setupIntents.create(
      {
        customer: customerId,
        usage: 'off_session',
        ...(useExplicit
          ? { payment_method_types: paymentMethodTypes }
          : { automatic_payment_methods: { enabled: true } }),
      },
      { idempotencyKey },
    );
  }

  cancelSetupIntent(setupIntentId: string): Promise<Stripe.SetupIntent> {
    return this.stripe.setupIntents.cancel(setupIntentId);
  }

  listSetupIntents(
    customerId: string,
    limit = 10,
  ): Promise<Stripe.ApiList<Stripe.SetupIntent>> {
    return this.stripe.setupIntents.list({ customer: customerId, limit });
  }

  listPaymentMethods(
    customerId: string,
  ): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
    return this.stripe.paymentMethods.list({ customer: customerId });
  }

  retrievePaymentMethod(
    paymentMethodId: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.retrieve(paymentMethodId);
  }

  detachPaymentMethod(
    paymentMethodId: string,
    idempotencyKey: string,
  ): Promise<Stripe.PaymentMethod> {
    return this.stripe.paymentMethods.detach(paymentMethodId, undefined, {
      idempotencyKey,
    });
  }
}
