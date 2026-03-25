import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STRIPE_WEBHOOK_EVENTS } from '@stripe-app/shared';
import { StripeService } from '../stripe/stripe.service';
import { SetupIntentHandler } from './handlers/setup-intent.handler';
import { PaymentMethodHandler } from './handlers/payment-method.handler';
import { PaymentIntentHandler } from './handlers/payment-intent.handler';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly webhookSecret: string;

  constructor(
    private stripeService: StripeService,
    private configService: ConfigService,
    private setupIntentHandler: SetupIntentHandler,
    private paymentMethodHandler: PaymentMethodHandler,
    private paymentIntentHandler: PaymentIntentHandler,
  ) {
    this.webhookSecret =
      this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');
  }

  async handleEvent(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripeService.constructWebhookEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );

    this.logger.log(`Received Stripe event: ${event.type} (${event.id})`);

    try {
      switch (event.type) {
        case STRIPE_WEBHOOK_EVENTS.SETUP_INTENT_SUCCEEDED:
          await this.setupIntentHandler.handleSucceeded(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.PAYMENT_METHOD_ATTACHED:
          await this.paymentMethodHandler.handleAttached(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.PAYMENT_METHOD_DETACHED:
          await this.paymentMethodHandler.handleDetached(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.PAYMENT_INTENT_SUCCEEDED:
          await this.paymentIntentHandler.handleSucceeded(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.PAYMENT_INTENT_FAILED:
          await this.paymentIntentHandler.handleFailed(event);
          break;

        default:
          this.logger.debug(`Unhandled event type: ${event.type}`);
      }
    } catch (error) {
      this.logger.error(
        `Error processing event ${event.type} (${event.id}): ${error.message}`,
        error.stack,
      );
      // Return successfully to avoid Stripe retries on business logic errors
    }
  }
}
