import Stripe from 'stripe';

export function createSetupIntent(
  stripe: Stripe,
  customerId: string,
  idempotencyKey: string,
): Promise<Stripe.SetupIntent> {
  return stripe.setupIntents.create(
    {
      customer: customerId,
      usage: 'off_session',
      payment_method_types: ['card'],
    },
    { idempotencyKey },
  );
}

export function listSetupIntents(
  stripe: Stripe,
  customerId: string,
  limit = 10,
): Promise<Stripe.ApiList<Stripe.SetupIntent>> {
  return stripe.setupIntents.list({ customer: customerId, limit });
}

export function listPaymentMethods(
  stripe: Stripe,
  customerId: string,
): Promise<Stripe.ApiList<Stripe.PaymentMethod>> {
  return stripe.paymentMethods.list({ customer: customerId });
}

export function retrievePaymentMethod(
  stripe: Stripe,
  paymentMethodId: string,
): Promise<Stripe.PaymentMethod> {
  return stripe.paymentMethods.retrieve(paymentMethodId);
}

export function detachPaymentMethod(
  stripe: Stripe,
  paymentMethodId: string,
  idempotencyKey: string,
): Promise<Stripe.PaymentMethod> {
  return stripe.paymentMethods.detach(paymentMethodId, undefined, {
    idempotencyKey,
  });
}
