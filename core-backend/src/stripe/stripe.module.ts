import { Global, Module } from '@nestjs/common';
import { stripeClientProvider } from './stripe-client.provider';
import { StripeCustomersService } from './stripe-customers.service';
import { StripePaymentIntentsService } from './stripe-payment-intents.service';
import { StripePaymentMethodsService } from './stripe-payment-methods.service';
import { StripeBillingService } from './stripe-billing.service';
import { StripeWebhooksService } from './stripe-webhooks.service';

@Global()
@Module({
  providers: [
    stripeClientProvider,
    StripeCustomersService,
    StripePaymentIntentsService,
    StripePaymentMethodsService,
    StripeBillingService,
    StripeWebhooksService,
  ],
  exports: [
    stripeClientProvider,
    StripeCustomersService,
    StripePaymentIntentsService,
    StripePaymentMethodsService,
    StripeBillingService,
    StripeWebhooksService,
  ],
})
export class StripeModule {}
