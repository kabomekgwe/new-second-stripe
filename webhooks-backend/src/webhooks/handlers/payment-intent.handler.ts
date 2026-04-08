import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  PaymentStatus,
  ChargeStatus,
} from '@stripe-app/shared';
import { OracleService } from '../../database/oracle.service';

@Injectable()
export class PaymentIntentHandler {
  private readonly logger = new Logger(PaymentIntentHandler.name);
  private static readonly USER_PAYMENT_TYPE = 'user_payment';

  constructor(
    private readonly database: OracleService,
  ) {}

  async handleSucceeded(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    if (paymentIntent.metadata?.type === 'management_fee') {
      await this.updateUsageCharge(paymentIntent, ChargeStatus.PAID);
    }

    await this.updatePayment(paymentIntent, PaymentStatus.SUCCEEDED);
  }

  async handleFailed(event: Stripe.Event): Promise<void> {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    if (paymentIntent.metadata?.type === 'management_fee') {
      await this.updateUsageCharge(paymentIntent, ChargeStatus.FAILED);
    }

    await this.updatePayment(paymentIntent, PaymentStatus.FAILED);
  }

  private async updatePayment(
    paymentIntent: Stripe.PaymentIntent,
    status: PaymentStatus,
  ): Promise<void> {
    const payment = await this.resolvePayment(paymentIntent);

    if (!payment) {
      if (paymentIntent.metadata?.type === PaymentIntentHandler.USER_PAYMENT_TYPE) {
        throw new Error(
          `Unable to reconcile PaymentIntent ${paymentIntent.id} to a local payment`,
        );
      }

      this.logger.debug(
        `No payment record found for PaymentIntent ${paymentIntent.id}`,
      );
      return;
    }

    await this.database.query(
      `UPDATE payments
       SET
         status = :2,
         "stripePaymentIntentId" = COALESCE("stripePaymentIntentId", :3),
         "updatedAt" = SYSTIMESTAMP
       WHERE id = :1`,
      [payment.id, status, paymentIntent.id],
    );
    this.logger.log(
      `Updated payment ${payment.id} to status ${status}`,
    );
  }

  private async resolvePayment(
    paymentIntent: Stripe.PaymentIntent,
  ): Promise<{ id: string } | null> {
    const paymentResult = await this.database.query<{ id: string }>(
      'SELECT id FROM payments WHERE "stripePaymentIntentId" = :1 FETCH FIRST 1 ROWS ONLY',
      [paymentIntent.id],
    );
    const payment = paymentResult.rows[0];

    if (payment) {
      return payment;
    }

    const metadataUserId = paymentIntent.metadata?.userId;
    const metadataIdempotencyKey = paymentIntent.metadata?.idempotencyKey;
    if (!metadataUserId || !metadataIdempotencyKey) {
      return null;
    }

    const fallbackResult = await this.database.query<{ id: string }>(
      `SELECT id
       FROM payments
       WHERE "userId" = :1
         AND "idempotencyKey" = :2
         AND status = :3
         AND "stripePaymentIntentId" IS NULL
       ORDER BY "createdAt" DESC
       FETCH FIRST 1 ROWS ONLY`,
      [metadataUserId, metadataIdempotencyKey, PaymentStatus.PENDING],
    );

    return fallbackResult.rows[0] ?? null;
  }

  private async updateUsageCharge(
    paymentIntent: Stripe.PaymentIntent,
    status: ChargeStatus,
  ): Promise<void> {
    const usageChargeResult = await this.database.query<{ id: string }>(
      'SELECT id FROM usage_charges WHERE "stripePaymentIntentId" = :1 FETCH FIRST 1 ROWS ONLY',
      [paymentIntent.id],
    );
    const usageCharge = usageChargeResult.rows[0];

    if (!usageCharge) {
      this.logger.debug(
        `No usage charge found for PaymentIntent ${paymentIntent.id}`,
      );
      return;
    }

    await this.database.query(
      'UPDATE usage_charges SET status = :2, "updatedAt" = SYSTIMESTAMP WHERE id = :1',
      [usageCharge.id, status],
    );
    this.logger.log(
      `Updated usage charge ${usageCharge.id} to status ${status}`,
    );
  }
}
