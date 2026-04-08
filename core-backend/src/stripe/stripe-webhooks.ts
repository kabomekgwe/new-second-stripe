import Stripe from 'stripe';

export function constructWebhookEvent(
  stripe: Stripe,
  rawBody: Buffer,
  signature: string,
  secret: string,
): Stripe.Event {
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
