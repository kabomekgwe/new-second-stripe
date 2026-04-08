import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { ChargeStatus } from '@stripe-app/shared';
import { EmailService } from '../../email/email.service';
import { OracleService } from '../../database/oracle.service';

@Injectable()
export class InvoiceHandler {
  private readonly logger = new Logger(InvoiceHandler.name);

  constructor(
    private readonly database: OracleService,
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
        `UPDATE STRIPE_USAGE_CHARGES
         SET
           STRIPE_INVOICE_ID = :2,
           STRIPE_PAYMENT_INTENT_ID = :3,
           STATUS = :4,
           UPDATED_AT = SYSTIMESTAMP
         WHERE ID = :1`,
        [charge.id, invoice.id, paymentIntentId, status],
      );

      if (status === ChargeStatus.PAID) {
        await this.sendInvoiceEmailOnce(charge.id);
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

      this.logger.debug(
        `Invoice line period raw timestamps: start=${line.period.start}, end=${line.period.end}`,
      );

      const billingPeriodStart = this.toPeriodDate(line.period.start);
      const billingPeriodEnd = this.toPeriodEndDate(line.period.end);

      this.logger.debug(
        `Computed billing period: start=${billingPeriodStart.toISOString()}, end=${billingPeriodEnd.toISOString()}`,
      );

      const chargeResult = await this.database.query<{ id: string }>(
        `SELECT ID
         FROM STRIPE_USAGE_CHARGES
         WHERE STRIPE_SUBSCRIPTION_ID = :1
           AND STRIPE_SUBSCRIPTION_ITEM_ID = :2
           AND BILLING_PERIOD_START = :3
           AND BILLING_PERIOD_END = :4
         FETCH FIRST 1 ROWS ONLY`,
        [subscriptionId, subscriptionItemId, billingPeriodStart, billingPeriodEnd],
      );
      const charge = chargeResult.rows[0] ?? null;

      this.logger.debug(
        charge
          ? `Matched usage charge id=${charge.id} for subscriptionItem=${subscriptionItemId}`
          : `No matching usage charge found for subscriptionItem=${subscriptionItemId} period=${billingPeriodStart.toISOString()}–${billingPeriodEnd.toISOString()}`,
      );

      if (!charge || chargeIds.has(charge.id)) {
        continue;
      }

      chargeIds.add(charge.id);
      charges.push(charge);
    }

    return charges;
  }

  private async sendInvoiceEmailOnce(chargeId: string): Promise<void> {
    const result = await this.database.query<{
      id: string;
      amountGbp: number;
      description: string | null;
      billingPeriodStart: Date;
      billingPeriodEnd: Date;
      emailSentAt: Date | null;
      email: string;
      name: string;
    }>(
      `SELECT
         uc.ID,
         uc.AMOUNT_GBP,
         uc.DESCRIPTION,
         uc.BILLING_PERIOD_START,
         uc.BILLING_PERIOD_END,
         uc.EMAIL_SENT_AT,
         u.EMAIL,
         u.USER_NAME
       FROM STRIPE_USAGE_CHARGES uc
       JOIN USERS u ON u.ID = uc.USER_ID
       WHERE uc.ID = :1
       FETCH FIRST 1 ROWS ONLY`,
      [chargeId],
    );
    const charge = result.rows[0];

    if (!charge) {
      this.logger.warn(`Cannot send invoice email: charge ${chargeId} not found`);
      return;
    }

    if (charge.emailSentAt) {
      this.logger.debug(`Invoice email already sent for charge ${chargeId} at ${charge.emailSentAt}`);
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

    await this.database.query(
      `UPDATE STRIPE_USAGE_CHARGES SET EMAIL_SENT_AT = SYSTIMESTAMP, UPDATED_AT = SYSTIMESTAMP WHERE ID = :1`,
      [chargeId],
    );
  }

  private toPeriodDate(timestamp: number): Date {
    const value = new Date(timestamp * 1000);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private toPeriodEndDate(timestamp: number): Date {
    const value = new Date((timestamp - 1) * 1000);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
}
