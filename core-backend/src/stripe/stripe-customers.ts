import Stripe from 'stripe';

export function createCustomer(
  stripe: Stripe,
  params: Stripe.CustomerCreateParams,
  idempotencyKey: string,
): Promise<Stripe.Customer> {
  return stripe.customers.create(params, { idempotencyKey });
}

export function updateCustomerDefaultPaymentMethod(
  stripe: Stripe,
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
  return stripe.customers.update(customerId, params);
}
