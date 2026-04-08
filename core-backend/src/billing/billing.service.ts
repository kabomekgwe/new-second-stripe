import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BillingSubscription,
  BillingSubscriptionStatus,
  ChargeStatus,
  UsageCharge,
  User,
} from '@stripe-app/shared';
import Stripe from 'stripe';
import { StripeBillingService } from '../stripe/stripe-billing.service';
import { StripeCustomersService } from '../stripe/stripe-customers.service';
import { generateUniqueIdempotencyKey } from '../common/utils/idempotency';
import { BillingSqlService } from './billing.sql.service';

/** Day of month when subscriptions bill. */
const BILLING_DAY = 25;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly billingProductId: string;

  constructor(
    private readonly billingSql: BillingSqlService,
    private readonly stripeBilling: StripeBillingService,
    private readonly stripeCustomers: StripeCustomersService,
    private readonly configService: ConfigService,
  ) {
    this.billingProductId = this.configService.get<string>(
      'STRIPE_BILLING_PRODUCT_ID',
      '',
    );
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (
      nodeEnv === 'production' &&
      (!this.billingProductId || this.billingProductId.endsWith('_xxx'))
    ) {
      throw new Error('STRIPE_BILLING_PRODUCT_ID must be configured');
    }
    if (!this.billingProductId && nodeEnv !== 'production') {
      this.logger.warn('STRIPE_BILLING_PRODUCT_ID is not set');
    }
  }

  async chargeUser(
    user: User,
    amount: number,
    description?: string,
  ): Promise<UsageCharge> {
    return this.addInvoiceItemForUser(user, amount, description);
  }

  async chargeAllUsers(): Promise<{
    total: number;
    succeeded: number;
    failed: number;
    skipped: number;
    errors: Array<{ userId: string; error: string }>;
  }> {
    const users = await this.billingSql.findBillableUsers();
    const results = {
      total: users.length,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      errors: [] as Array<{ userId: string; error: string }>,
    };
    for (const user of users) {
      try {
        const charge = await this.addInvoiceItemForUser(
          user,
          Number(user.monthlyManagementFee),
        );
        results[
          charge.status === ChargeStatus.PROCESSING ? 'succeeded' : 'skipped'
        ]++;
      } catch (error) {
        results.failed++;
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        results.errors.push({ userId: user.id, error: message });
        this.logger.error(
          `Failed to charge user ${user.id}: ${message}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    return results;
  }

  async getUserCharges(userId: string): Promise<UsageCharge[]> {
    return this.billingSql.listUsageChargesByUserId(userId);
  }

  private async addInvoiceItemForUser(
    user: User,
    amount: number,
    description?: string,
  ): Promise<UsageCharge> {
    if (!user.stripeCustomerId)
      throw new Error(`User ${user.id} does not have a Stripe customer`);
    const subscription = await this.ensureBillingSubscription(user);
    const period = this.getCurrentBillingPeriod();
    const idempotencyKey = generateUniqueIdempotencyKey(
      'usage_charge',
      user.id,
      period.key,
    );
    const existing =
      await this.billingSql.findUsageChargeByIdempotencyKey(idempotencyKey);
    if (existing) return existing;

    await this.stripeBilling.createInvoiceItem({
      customer: user.stripeCustomerId,
      subscription: subscription.stripeSubscriptionId,
      amount,
      currency: 'gbp',
      description: description ?? `Management fee - ${period.key}`,
    });

    return this.billingSql.upsertUsageCharge({
      userId: user.id,
      stripeInvoiceId: null,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripeSubscriptionItemId: subscription.stripeSubscriptionItemId,
      stripePaymentIntentId: null,
      amountGbp: amount,
      description: description ?? `Management fee - ${period.key}`,
      billingPeriodStart: period.start,
      billingPeriodEnd: period.end,
      status: ChargeStatus.PROCESSING,
      idempotencyKey,
      usageReportedAt: new Date(),
      emailSentAt: null,
    });
  }

  private async ensureBillingSubscription(
    user: User,
  ): Promise<BillingSubscription> {
    const local = await this.billingSql.findBillingSubscriptionByUserId(
      user.id,
    );
    if (local && local.status !== BillingSubscriptionStatus.CANCELED)
      return local;
    const subs = await this.stripeBilling.listSubscriptions(
      user.stripeCustomerId!,
    );
    const existing = subs.data.find(
      (s) =>
        s.metadata?.userId === user.id && s.status !== 'canceled',
    );
    if (existing) return this.upsertBillingSubscription(user.id, existing);
    if (!user.defaultPaymentMethodId)
      throw new Error(`User ${user.id} needs default payment method`);
    await this.stripeCustomers.updateDefaultPaymentMethod(
      user.stripeCustomerId!,
      user.defaultPaymentMethodId,
    );
    const created = await this.stripeBilling.createBillingSubscription({
      customerId: user.stripeCustomerId!,
      productId: this.getProductId(),
      userId: user.id,
      billingCycleAnchor: getNextBillingAnchor(),
      defaultPaymentMethod: user.defaultPaymentMethodId,
    });
    return this.upsertBillingSubscription(user.id, created);
  }

  private async upsertBillingSubscription(
    userId: string,
    subscription: Stripe.Subscription,
  ): Promise<BillingSubscription> {
    const raw = subscription as unknown as Record<string, unknown>;
    const subItem = subscription.items.data[0];
    if (!subItem)
      throw new Error(`Subscription ${subscription.id} missing item`);
    return this.billingSql.upsertBillingSubscription({
      userId,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionItemId: subItem.id,
      stripePriceId: subItem.price.id,
      status: subscription.status as BillingSubscriptionStatus,
      currentPeriodStart:
        typeof raw.current_period_start === 'number'
          ? new Date(raw.current_period_start * 1000)
          : null,
      currentPeriodEnd:
        typeof raw.current_period_end === 'number'
          ? new Date(raw.current_period_end * 1000)
          : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    });
  }

  getCurrentBillingPeriod(d = new Date()): {
    key: string;
    start: Date;
    end: Date;
  } {
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const day = d.getUTCDate();

    // Period runs from the 25th of one month to the 24th of the next.
    // If today >= 25th, current period started this month's 25th.
    // If today < 25th, current period started last month's 25th.
    let startYear: number, startMonth: number;
    if (day >= BILLING_DAY) {
      startYear = year;
      startMonth = month;
    } else {
      // Go back one month
      startYear = month === 0 ? year - 1 : year;
      startMonth = month === 0 ? 11 : month - 1;
    }

    const start = new Date(Date.UTC(startYear, startMonth, BILLING_DAY));
    const end = new Date(Date.UTC(startYear, startMonth + 1, BILLING_DAY - 1));

    const label = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, '0')}-25`;
    return { key: label, start, end };
  }

  async checkBillingHealth(): Promise<{
    productId: string;
    billingDay: number;
  }> {
    return {
      productId: this.getProductId(),
      billingDay: BILLING_DAY,
    };
  }

  private getProductId(): string {
    if (!this.billingProductId)
      throw new Error('STRIPE_BILLING_PRODUCT_ID not configured');
    return this.billingProductId;
  }
}

/**
 * Returns a Unix timestamp for the next 25th at 09:00 UTC.
 * If today is already the 25th but before 09:00, uses today.
 * If today is the 25th at or after 09:00, or past the 25th, uses next month.
 */
export function getNextBillingAnchor(now = new Date()): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const day = now.getUTCDate();
  const hour = now.getUTCHours();

  let anchorDate: Date;
  if (day < BILLING_DAY || (day === BILLING_DAY && hour < 9)) {
    anchorDate = new Date(Date.UTC(year, month, BILLING_DAY, 9, 0, 0));
  } else {
    anchorDate = new Date(Date.UTC(year, month + 1, BILLING_DAY, 9, 0, 0));
  }
  return Math.floor(anchorDate.getTime() / 1000);
}
