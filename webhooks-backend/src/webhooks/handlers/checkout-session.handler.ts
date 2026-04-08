import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PaymentStatus } from '../../shared';
import { OracleService } from '../../database/oracle.service';

@Injectable()
export class CheckoutSessionHandler {
  private readonly logger = new Logger(CheckoutSessionHandler.name);

  constructor(
    private readonly database: OracleService,
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
      'SELECT ID FROM STRIPE_PAYMENTS WHERE STRIPE_CHECKOUT_SESSION_ID = :1 FETCH FIRST 1 ROWS ONLY',
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
      `UPDATE STRIPE_PAYMENTS
       SET
         STATUS = COALESCE(:2, STATUS),
         STRIPE_PAYMENT_INTENT_ID = :3,
         AMOUNT_USER_CURRENCY = :4,
         USER_CURRENCY = :5,
         UPDATED_AT = SYSTIMESTAMP
       WHERE ID = :1`,
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
