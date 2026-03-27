import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { ChargeStatus } from '@stripe-app/shared';
import { EmailService } from '../../email/email.service';
import { PostgresService } from '../../database/postgres.service';

@Injectable()
export class InvoiceHandler {
  private readonly logger = new Logger(InvoiceHandler.name);

  constructor(
    private readonly database: PostgresService,
    private readonly emailService: EmailService,
  ) {}

  async handleFinalized(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    await this.syncInvoiceCharges(invoice, ChargeStatus.PROCESSING);
  }

  async handlePaid(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    await this.syncInvoiceCharges(invoice, ChargeStatus.PAID);
  }

  async handlePaymentFailed(event: Stripe.Event): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    await this.syncInvoiceCharges(invoice, ChargeStatus.FAILED);
  }

  private async syncInvoiceCharges(
    invoice: Stripe.Invoice,
    status: ChargeStatus,
  ): Promise<void> {
    const invoiceData = invoice as Stripe.Invoice & {
      subscription?: string | Stripe.Subscription;
      payment_intent?: string | Stripe.PaymentIntent;
    };
    const subscriptionId =
      typeof invoiceData.subscription === 'string'
        ? invoiceData.subscription
        : invoiceData.subscription?.id;

    if (!subscriptionId) {
      this.logger.debug(`Invoice ${invoice.id} has no subscription`);
      return;
    }

    const charges = await this.findUsageCharges(invoice, subscriptionId);
    if (charges.length === 0) {
      this.logger.debug(
        `No usage charges found for invoice ${invoice.id} subscription ${subscriptionId}`,
      );
      return;
    }

    const paymentIntentId =
      typeof invoiceData.payment_intent === 'string'
        ? invoiceData.payment_intent
        : invoiceData.payment_intent?.id ?? null;

    for (const charge of charges) {
      await this.database.query(
        `
          UPDATE usage_charges
          SET
            "stripeInvoiceId" = $2,
            "stripePaymentIntentId" = $3,
            status = $4,
            "updatedAt" = now()
          WHERE id = $1
        `,
        [charge.id, invoice.id, paymentIntentId, status],
      );

      if (status === ChargeStatus.PAID) {
        await this.sendInvoiceEmail(charge.id);
      }
    }
  }

  private async findUsageCharges(
    invoice: Stripe.Invoice,
    subscriptionId: string,
  ): Promise<Array<{ id: string }>> {
    const chargeIds = new Set<string>();
    const charges: Array<{ id: string }> = [];

    for (const line of invoice.lines.data) {
      const lineItem = line as Stripe.InvoiceLineItem & {
        parent: {
          subscription_item_details: {
            subscription_item: string;
          } | null;
        } | null;
      };
      const subscriptionItemId =
        lineItem.parent?.subscription_item_details?.subscription_item ?? null;

      if (!subscriptionItemId) {
        continue;
      }

      const billingPeriodStart = this.toPeriodDate(line.period.start);
      const billingPeriodEnd = this.toPeriodEndDate(line.period.end);

      const chargeResult = await this.database.query<{ id: string }>(
        `
          SELECT id
          FROM usage_charges
          WHERE "stripeSubscriptionId" = $1
            AND "stripeSubscriptionItemId" = $2
            AND "billingPeriodStart" = $3
            AND "billingPeriodEnd" = $4
          LIMIT 1
        `,
        [subscriptionId, subscriptionItemId, billingPeriodStart, billingPeriodEnd],
      );
      const charge = chargeResult.rows[0] ?? null;

      if (!charge || chargeIds.has(charge.id)) {
        continue;
      }

      chargeIds.add(charge.id);
      charges.push(charge);
    }

    return charges;
  }

  private async sendInvoiceEmail(chargeId: string): Promise<void> {
    const result = await this.database.query<{
      id: string;
      amountGbp: number;
      description: string | null;
      billingPeriodStart: Date;
      billingPeriodEnd: Date;
      email: string;
      name: string;
    }>(
      `
        SELECT
          uc.id,
          uc."amountGbp",
          uc.description,
          uc."billingPeriodStart",
          uc."billingPeriodEnd",
          u.email,
          u.name
        FROM usage_charges uc
        JOIN users u ON u.id = uc."userId"
        WHERE uc.id = $1
        LIMIT 1
      `,
      [chargeId],
    );
    const charge = result.rows[0];

    if (!charge) {
      this.logger.warn(`Cannot send invoice email: charge ${chargeId} not found`);
      return;
    }

    await this.emailService.sendInvoiceEmail({
      to: charge.email,
      userName: charge.name,
      amountPence: Number(charge.amountGbp),
      description: charge.description ?? 'Management fee',
      periodStart: new Date(charge.billingPeriodStart),
      periodEnd: new Date(charge.billingPeriodEnd),
      chargeId: charge.id,
    });
  }

  private toPeriodDate(timestamp: number): Date {
    const value = new Date(timestamp * 1000);
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  private toPeriodEndDate(timestamp: number): Date {
    const value = new Date((timestamp - 1) * 1000);
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
}
