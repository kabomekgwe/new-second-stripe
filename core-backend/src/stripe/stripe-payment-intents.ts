import Stripe from 'stripe';

export async function createFxQuote(
  stripe: Stripe,
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
  const response = await stripe.rawRequest(
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

export function createPaymentIntent(
  stripe: Stripe,
  params: Omit<Stripe.PaymentIntentCreateParams, 'currency'>,
  idempotencyKey: string,
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create(
    { ...params, currency: 'gbp' },
    { idempotencyKey },
  );
}

export function createCheckoutSession(
  stripe: Stripe,
  params: Stripe.Checkout.SessionCreateParams,
  idempotencyKey: string,
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create(params, { idempotencyKey });
}
