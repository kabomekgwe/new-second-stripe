import { Inject, Injectable } from '@nestjs/common';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe-client.token';

@Injectable()
export class StripeWebhooksService {
  constructor(@Inject(STRIPE_CLIENT) private readonly stripe: Stripe) {}

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }
}
