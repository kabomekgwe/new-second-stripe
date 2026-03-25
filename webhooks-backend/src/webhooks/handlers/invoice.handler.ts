import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import Stripe from 'stripe';
import { UsageCharge, ChargeStatus } from '@stripe-app/shared';

@Injectable()
export class InvoiceHandler {
  private readonly logger = new Logger(InvoiceHandler.name);

  constructor(
    @InjectRepository(UsageCharge)
    private usageChargeRepository: Repository<UsageCharge>,
  ) {}

  async handlePaid(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const paymentIntentId = (invoice as any).payment_intent as string | null;

    if (!paymentIntentId) {
      this.logger.debug(`Invoice ${invoice.id} has no payment intent`);
      return;
    }

    const charge = await this.usageChargeRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!charge) {
      this.logger.debug(`No usage charge for invoice ${invoice.id}`);
      return;
    }

    await this.usageChargeRepository.update(charge.id, { status: ChargeStatus.PAID });
    this.logger.log(`Invoice paid: updated usage charge ${charge.id}`);
  }

  async handlePaymentFailed(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    const paymentIntentId = (invoice as any).payment_intent as string | null;

    if (!paymentIntentId) {
      this.logger.debug(`Invoice ${invoice.id} has no payment intent`);
      return;
    }

    const charge = await this.usageChargeRepository.findOne({
      where: { stripePaymentIntentId: paymentIntentId },
    });

    if (!charge) {
      this.logger.debug(`No usage charge for invoice ${invoice.id}`);
      return;
    }

    await this.usageChargeRepository.update(charge.id, { status: ChargeStatus.FAILED });
    this.logger.log(`Invoice payment failed: updated usage charge ${charge.id}`);
  }
}
