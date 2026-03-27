import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import {
  STRIPE_WEBHOOK_EVENTS,
  WebhookEvent,
  WebhookEventStatus,
} from '@stripe-app/shared';
import { Repository } from 'typeorm';
import { StripeService } from '../stripe/stripe.service';
import { SetupIntentHandler } from './handlers/setup-intent.handler';
import { PaymentMethodHandler } from './handlers/payment-method.handler';
import { PaymentIntentHandler } from './handlers/payment-intent.handler';
import { CheckoutSessionHandler } from './handlers/checkout-session.handler';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly webhookSecret: string;

  constructor(
    @InjectRepository(WebhookEvent)
    private webhookEventRepository: Repository<WebhookEvent>,
    private stripeService: StripeService,
    private configService: ConfigService,
    private setupIntentHandler: SetupIntentHandler,
    private paymentMethodHandler: PaymentMethodHandler,
    private paymentIntentHandler: PaymentIntentHandler,
    private checkoutSessionHandler: CheckoutSessionHandler,
  ) {
    this.webhookSecret =
      this.configService.getOrThrow<string>('STRIPE_WEBHOOK_SECRET');

    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production' && this.webhookSecret.endsWith('_xxx')) {
      throw new Error('STRIPE_WEBHOOK_SECRET must be configured with a real value');
    }
  }

  async handleEvent(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripeService.constructWebhookEvent(
      rawBody,
      signature,
      this.webhookSecret,
    );
    const existingEvent = await this.webhookEventRepository.findOne({
      where: { eventId: event.id },
    });

    if (existingEvent?.status === WebhookEventStatus.PROCESSED) {
      this.logger.log(`Skipping duplicate Stripe event ${event.id}`);
      return;
    }

    if (existingEvent?.status === WebhookEventStatus.PROCESSING) {
      this.logger.warn(`Stripe event ${event.id} is already processing`);
      return;
    }

    await this.webhookEventRepository.save(
      this.webhookEventRepository.create({
        eventId: event.id,
        type: event.type,
        status: WebhookEventStatus.PROCESSING,
        processedAt: null,
        lastError: null,
      }),
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

        case STRIPE_WEBHOOK_EVENTS.CHECKOUT_SESSION_COMPLETED:
          await this.checkoutSessionHandler.handleCompleted(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.CHECKOUT_SESSION_ASYNC_PAYMENT_SUCCEEDED:
          await this.checkoutSessionHandler.handleAsyncSucceeded(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.CHECKOUT_SESSION_ASYNC_PAYMENT_FAILED:
          await this.checkoutSessionHandler.handleAsyncFailed(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.CHECKOUT_SESSION_EXPIRED:
          await this.checkoutSessionHandler.handleExpired(event);
          break;

        default:
          this.logger.debug(`Unhandled event type: ${event.type}`);
      }

      await this.webhookEventRepository.update(event.id, {
        status: WebhookEventStatus.PROCESSED,
        processedAt: new Date(),
        lastError: null,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.webhookEventRepository.update(event.id, {
        status: WebhookEventStatus.FAILED,
        lastError: errorMessage,
      });

      this.logger.error(
        `Error processing event ${event.type} (${event.id}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Re-throw so Stripe receives a non-200 response and retries
      throw error;
    }
  }
}
