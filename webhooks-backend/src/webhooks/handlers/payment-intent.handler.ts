import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import {
  PaymentStatus,
  ChargeStatus,
} from '@stripe-app/shared';
import { PostgresService } from '../../database/postgres.service';

@Injectable()
export class PaymentIntentHandler {
  private readonly logger = new Logger(PaymentIntentHandler.name);

  constructor(
    private readonly database: PostgresService,
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

  private async updatePayment(paymentIntent: Stripe.PaymentIntent, status: PaymentStatus): Promise<void> {
    const paymentResult = await this.database.query<{ id: string }>(
      'SELECT id FROM payments WHERE "stripePaymentIntentId" = $1 LIMIT 1',
      [paymentIntent.id],
    );
    const payment = paymentResult.rows[0];

    if (!payment) {
      this.logger.debug(
        `No payment record found for PaymentIntent ${paymentIntent.id}`,
      );
      return;
    }

    await this.database.query(
      'UPDATE payments SET status = $2, "updatedAt" = now() WHERE id = $1',
      [payment.id, status],
    );
    this.logger.log(
      `Updated payment ${payment.id} to status ${status}`,
    );
  }

  private async updateUsageCharge(
    paymentIntent: Stripe.PaymentIntent,
    status: ChargeStatus,
  ): Promise<void> {
    const usageChargeResult = await this.database.query<{ id: string }>(
      'SELECT id FROM usage_charges WHERE "stripePaymentIntentId" = $1 LIMIT 1',
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
      'UPDATE usage_charges SET status = $2, "updatedAt" = now() WHERE id = $1',
      [usageCharge.id, status],
    );
    this.logger.log(
      `Updated usage charge ${usageCharge.id} to status ${status}`,
    );
  }
}
