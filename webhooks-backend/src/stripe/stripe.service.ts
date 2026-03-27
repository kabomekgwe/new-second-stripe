import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

@Injectable()
export class StripeService {
  private readonly stripe: Stripe;

  constructor(private configService: ConfigService) {
    const secretKey = this.configService.getOrThrow<string>('STRIPE_SECRET_KEY');
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');

    if (nodeEnv === 'production' && secretKey.endsWith('_xxx')) {
      throw new Error('STRIPE_SECRET_KEY must be configured with a real value');
    }

    this.stripe = new Stripe(
      secretKey,
      { apiVersion: '2026-02-25.clover' },
    );
  }

  constructWebhookEvent(
    rawBody: Buffer,
    signature: string,
    secret: string,
  ): Stripe.Event {
    return this.stripe.webhooks.constructEvent(rawBody, signature, secret);
  }

  getClient(): Stripe {
    return this.stripe;
  }
}
