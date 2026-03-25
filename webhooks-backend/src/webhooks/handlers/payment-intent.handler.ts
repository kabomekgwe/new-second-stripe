import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import {
  Payment,
  UsageCharge,
  PaymentStatus,
  ChargeStatus,
} from '@stripe-app/shared';

@Injectable()
export class PaymentIntentHandler {
  private readonly logger = new Logger(PaymentIntentHandler.name);

  constructor(
    @InjectRepository(Payment)
    private paymentRepository: Repository<Payment>,
    @InjectRepository(UsageCharge)
    private usageChargeRepository: Repository<UsageCharge>,
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
    const payment = await this.paymentRepository.findOne({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (!payment) {
      this.logger.debug(
        `No payment record found for PaymentIntent ${paymentIntent.id}`,
      );
      return;
    }

    await this.paymentRepository.update(payment.id, { status });
    this.logger.log(
      `Updated payment ${payment.id} to status ${status}`,
    );
  }

  private async updateUsageCharge(
    paymentIntent: Stripe.PaymentIntent,
    status: ChargeStatus,
  ): Promise<void> {
    const usageCharge = await this.usageChargeRepository.findOne({
      where: { stripePaymentIntentId: paymentIntent.id },
    });

    if (!usageCharge) {
      this.logger.debug(
        `No usage charge found for PaymentIntent ${paymentIntent.id}`,
      );
      return;
    }

    await this.usageChargeRepository.update(usageCharge.id, { status });
    this.logger.log(
      `Updated usage charge ${usageCharge.id} to status ${status}`,
    );
  }
}
