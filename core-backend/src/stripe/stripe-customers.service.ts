import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe-client.token';

@Injectable()
export class StripeCustomersService {
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  async customerExists(customerId: string): Promise<boolean> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);
      return !('deleted' in customer && customer.deleted === true);
    } catch (error: unknown) {
      if (
        error instanceof Stripe.errors.StripeInvalidRequestError &&
        error.code === 'resource_missing'
      ) {
        return false;
      }
      throw error;
    }
  }

  createCustomer(
    params: Stripe.CustomerCreateParams,
    idempotencyKey: string,
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.create(params, { idempotencyKey });
  }

  updateCustomer(
    customerId: string,
    params: Stripe.CustomerUpdateParams,
  ): Promise<Stripe.Customer> {
    return this.stripe.customers.update(customerId, params);
  }

  updateDefaultPaymentMethod(
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
}
