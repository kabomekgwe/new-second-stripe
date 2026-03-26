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
      status: PaymentStatus.SUCCEEDED,
      stripePaymentIntentId: paymentIntentId,
      amountUserCurrency: session.amount_total,
      userCurrency: session.currency?.toUpperCase() ?? null,
    });

    this.logger.log(
      `Checkout session ${session.id} completed — payment ${payment.id} updated to succeeded`,
    );
  }

  async handleExpired(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session;

    const payment = await this.paymentRepository.findOne({
      where: { stripeCheckoutSessionId: session.id },
    });

    if (!payment) {
      this.logger.debug(
        `No payment record found for expired Checkout Session ${session.id}`,
      );
      return;
    }

    await this.paymentRepository.update(payment.id, {
      status: PaymentStatus.CANCELLED,
    });

    this.logger.log(
      `Checkout session ${session.id} expired — payment ${payment.id} cancelled`,
    );
  }
}
