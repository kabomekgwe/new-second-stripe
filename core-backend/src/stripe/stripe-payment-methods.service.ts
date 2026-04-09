import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe-client.token';

@Injectable()
export class StripePaymentMethodsService {
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  createSetupIntent(
    customerId: string,
    paymentMethodTypes: string[],
    idempotencyKey: string,
  ): Promise<Stripe.SetupIntent> {
    return this.stripe.setupIntents.create(
      {
        customer: customerId,
        usage: 'off_session',
        payment_method_types: paymentMethodTypes,
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
