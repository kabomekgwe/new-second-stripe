import { Module } from '@nestjs/common';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { SetupIntentHandler } from './handlers/setup-intent.handler';
import { PaymentMethodHandler } from './handlers/payment-method.handler';
import { PaymentIntentHandler } from './handlers/payment-intent.handler';
import { CheckoutSessionHandler } from './handlers/checkout-session.handler';
import { InvoiceHandler } from './handlers/invoice.handler';
import { SubscriptionHandler } from './handlers/subscription.handler';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [EmailModule],
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    SetupIntentHandler,
    PaymentMethodHandler,
    PaymentIntentHandler,
    CheckoutSessionHandler,
    InvoiceHandler,
    SubscriptionHandler,
  ],
})
export class WebhooksModule {}
