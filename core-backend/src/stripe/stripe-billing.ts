import Stripe from 'stripe';

export function listSubscriptions(
  stripe: Stripe,
  customerId: string,
  limit = 10,
): Promise<Stripe.ApiList<Stripe.Subscription>> {
  return stripe.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit,
  });
}

export function createBillingSubscription(
  stripe: Stripe,
  params: {
    customerId: string;
    priceId: string;
    userId: string;
  },
): Promise<Stripe.Subscription> {
  return stripe.subscriptions.create({
    customer: params.customerId,
    collection_method: 'charge_automatically',
    items: [{ price: params.priceId }],
    metadata: { userId: params.userId },
  });
}

export function createMeterEvent(
  stripe: Stripe,
  params: {
    eventName: string;
    customerId: string;
    value: number;
    identifier: string;
    timestamp: number;
  },
): Promise<Stripe.Billing.MeterEvent> {
  return stripe.billing.meterEvents.create({
    event_name: params.eventName,
    payload: {
      stripe_customer_id: params.customerId,
      value: String(params.value),
    },
    identifier: params.identifier,
    timestamp: params.timestamp,
  });
}

export function retrievePrice(
  stripe: Stripe,
  priceId: string,
): Promise<Stripe.Price> {
  return stripe.prices.retrieve(priceId);
}

export async function getBillingMeterEventName(
  stripe: Stripe,
  priceId: string,
  cache: { value: string | null },
): Promise<string> {
  if (cache.value) return cache.value;
  const price = await stripe.prices.retrieve(priceId);
  const meterId = price.recurring?.meter;
  if (!meterId)
    throw new Error(`Price ${priceId} is not configured with a billing meter`);
  const meter = await stripe.billing.meters.retrieve(meterId);
  cache.value = meter.event_name;
  return cache.value;
}
