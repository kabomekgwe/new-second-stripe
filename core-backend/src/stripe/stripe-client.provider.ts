import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { STRIPE_CLIENT } from './stripe-client.token';

function createStripeClient(configService: ConfigService): Stripe {
  const secretKey = configService.get<string>('STRIPE_SECRET_KEY', '');
  const nodeEnv = configService.get<string>('NODE_ENV', 'development');

  if (
    nodeEnv === 'production' &&
    (!secretKey ||
      secretKey.endsWith('_xxx') ||
      secretKey === 'sk_test_placeholder')
  ) {
    throw new Error('STRIPE_SECRET_KEY must be configured with a real value');
  }

  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is required. Set it in your .env file.');
  }

  return new Stripe(secretKey, { apiVersion: '2026-02-25.clover' });
}

export const stripeClientProvider = {
  provide: STRIPE_CLIENT,
  useFactory: (configService: ConfigService) => createStripeClient(configService),
  inject: [ConfigService],
};
