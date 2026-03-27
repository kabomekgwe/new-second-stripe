import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { Payment, PaymentStatus } from '@stripe-app/shared';

@Injectable()
export class CheckoutSessionHandler {
  private readonly logger = new Logger(CheckoutSessionHandler.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
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
    const payment = await this.paymentRepository.findOne({
      where: { stripeCheckoutSessionId: session.id },
    });

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

    await this.paymentRepository.update(payment.id, {
      ...(status ? { status } : {}),
      stripePaymentIntentId: paymentIntentId,
      amountUserCurrency: session.amount_total,
      userCurrency: session.currency?.toUpperCase() ?? null,
    });

    this.logger.log(
      `Checkout session ${session.id} updated payment ${payment.id}${status ? ` to ${status}` : ''}`,
    );
  }
}
