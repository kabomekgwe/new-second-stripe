import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentStatus } from '@stripe-app/shared';
import { PostgresService } from '../../database/postgres.service';

@Injectable()
export class CheckoutSessionHandler {
  private readonly logger = new Logger(CheckoutSessionHandler.name);

  constructor(
    private readonly database: PostgresService,
  ) {}

  async handleCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== 'paid') {
      await this.updatePaymentFromSession(session, null);
      this.logger.log(
        `Checkout session ${session.id} completed with payment_status=${session.payment_status}; keeping payment pending`,
      );
      return;
    }

    await this.updatePaymentFromSession(session, PaymentStatus.SUCCEEDED);
  }

  async handleAsyncSucceeded(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    await this.updatePaymentFromSession(session, PaymentStatus.SUCCEEDED);
  }

  async handleAsyncFailed(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    await this.updatePaymentFromSession(session, PaymentStatus.FAILED);
  }

  async handleExpired(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;
    await this.updatePaymentFromSession(session, PaymentStatus.CANCELLED);
  }

  private async updatePaymentFromSession(
    session: Stripe.Checkout.Session,
    status: PaymentStatus | null,
  ): Promise<void> {
    const paymentResult = await this.database.query<{ id: string }>(
      'SELECT id FROM payments WHERE "stripeCheckoutSessionId" = $1 LIMIT 1',
      [session.id],
    );
    const payment = paymentResult.rows[0];

    if (!payment) {
      this.logger.debug(
        `No payment record found for Checkout Session ${session.id}`,
      );
      return;
    }

    const paymentIntentId =
      typeof session.payment_intent === 'string'
        ? session.payment_intent
        : session.payment_intent?.id ?? null;

    await this.database.query(
      `
        UPDATE payments
        SET
          status = COALESCE($2, status),
          "stripePaymentIntentId" = $3,
          "amountUserCurrency" = $4,
          "userCurrency" = $5,
          "updatedAt" = now()
        WHERE id = $1
      `,
      [
        payment.id,
        status,
        paymentIntentId,
        session.amount_total ?? null,
        session.currency?.toUpperCase() ?? null,
      ],
    );

    this.logger.log(
      `Checkout session ${session.id} updated payment ${payment.id}${status ? ` to ${status}` : ''}`,
    );
  }
}
