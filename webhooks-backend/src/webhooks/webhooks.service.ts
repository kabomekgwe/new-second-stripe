import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  STRIPE_WEBHOOK_EVENTS,
  WebhookEventStatus,
} from '@stripe-app/shared';
import { StripeService } from '../stripe/stripe.service';
import { OracleService } from '../database/oracle.service';
import { SetupIntentHandler } from './handlers/setup-intent.handler';
import { PaymentMethodHandler } from './handlers/payment-method.handler';
import { PaymentIntentHandler } from './handlers/payment-intent.handler';
import { CheckoutSessionHandler } from './handlers/checkout-session.handler';
import { InvoiceHandler } from './handlers/invoice.handler';
import { SubscriptionHandler } from './handlers/subscription.handler';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly database: OracleService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
    private readonly setupIntentHandler: SetupIntentHandler,
    private readonly paymentMethodHandler: PaymentMethodHandler,
    private readonly paymentIntentHandler: PaymentIntentHandler,
    private readonly checkoutSessionHandler: CheckoutSessionHandler,
    private readonly invoiceHandler: InvoiceHandler,
    private readonly subscriptionHandler: SubscriptionHandler,
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
    const existingEventResult = await this.database.query<{
      eventId: string;
      status: WebhookEventStatus;
    }>(
      'SELECT "eventId", status FROM webhook_events WHERE "eventId" = :1 FETCH FIRST 1 ROWS ONLY',
      [event.id],
    );
    const existingEvent = existingEventResult.rows[0] ?? null;

    if (existingEvent?.status === WebhookEventStatus.PROCESSED) {
      this.logger.log(`Skipping duplicate Stripe event ${event.id}`);
      return;
    }

    if (existingEvent?.status === WebhookEventStatus.PROCESSING) {
      this.logger.warn(`Stripe event ${event.id} is already processing`);
      return;
    }

    await this.database.query(
      `MERGE INTO "webhook_events" t
       USING (SELECT :1 AS "eventId" FROM DUAL) s
       ON (t."eventId" = s."eventId")
       WHEN MATCHED THEN UPDATE SET
         "type" = :2, "status" = :3, "processedAt" = :4, "lastError" = :5, "updatedAt" = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         "eventId", "type", "status", "processedAt", "lastError"
       ) VALUES (:1, :2, :3, :4, :5)`,
      [event.id, event.type, WebhookEventStatus.PROCESSING, null, null],
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

        case STRIPE_WEBHOOK_EVENTS.INVOICE_FINALIZED:
          await this.invoiceHandler.handleFinalized(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.INVOICE_PAID:
          await this.invoiceHandler.handlePaid(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.INVOICE_PAYMENT_FAILED:
          await this.invoiceHandler.handlePaymentFailed(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.CUSTOMER_SUBSCRIPTION_CREATED:
          await this.subscriptionHandler.handleCreated(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.CUSTOMER_SUBSCRIPTION_UPDATED:
          await this.subscriptionHandler.handleUpdated(event);
          break;

        case STRIPE_WEBHOOK_EVENTS.CUSTOMER_SUBSCRIPTION_DELETED:
          await this.subscriptionHandler.handleDeleted(event);
          break;

        default:
          this.logger.debug(`Unhandled event type: ${event.type}`);
      }

      await this.database.query(
        `UPDATE webhook_events
         SET status = :2, "processedAt" = :3, "lastError" = NULL, "updatedAt" = SYSTIMESTAMP
         WHERE "eventId" = :1`,
        [event.id, WebhookEventStatus.PROCESSED, new Date()],
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      await this.database.query(
        `UPDATE webhook_events
         SET status = :2, "lastError" = :3, "updatedAt" = SYSTIMESTAMP
         WHERE "eventId" = :1`,
        [event.id, WebhookEventStatus.FAILED, errorMessage],
      );

      this.logger.error(
        `Error processing event ${event.type} (${event.id}): ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      // Re-throw so Stripe receives a non-200 response and retries
      throw error;
    }
  }
}
