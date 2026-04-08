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
import { StripeService } from '../stripe/stripe.service';
import { generateUniqueIdempotencyKey } from '../common/utils/idempotency';
import { BillingSqlService } from './billing.sql.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly billingPriceId: string;

  constructor(
    private readonly billingSql: BillingSqlService,
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {
    this.billingPriceId = this.configService.get<string>(
      'STRIPE_BILLING_METERED_PRICE_ID',
      '',
    );
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (
      nodeEnv === 'production' &&
      (!this.billingPriceId || this.billingPriceId.endsWith('_xxx'))
    ) {
      throw new Error('STRIPE_BILLING_METERED_PRICE_ID must be configured');
    }
    if (!this.billingPriceId && nodeEnv !== 'production') {
      this.logger.warn('STRIPE_BILLING_METERED_PRICE_ID is not set');
    }
  }

  async chargeUser(
    user: User,
    amount: number,
    description?: string,
  ): Promise<UsageCharge> {
    return this.reportUsageForUser(user, amount, description);
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
        const charge = await this.reportUsageForUser(
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

  private async reportUsageForUser(
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
    const eventName = await this.stripeService.getBillingMeterEventName(
      this.getBillingPriceId(),
    );
    await this.stripeService.createMeterEvent({
      eventName,
      customerId: user.stripeCustomerId,
      value: amount,
      identifier: idempotencyKey,
      timestamp: Math.floor(Date.now() / 1000),
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
    const subs = await this.stripeService.listSubscriptions(
      user.stripeCustomerId!,
    );
    const existing = subs.data.find(
      (s) =>
        s.items.data.some((i) => i.price.id === this.getBillingPriceId()) &&
        s.status !== 'canceled',
    );
    if (existing) return this.upsertBillingSubscription(user.id, existing);
    if (!user.defaultPaymentMethodId)
      throw new Error(`User ${user.id} needs default payment method`);
    await this.stripeService.updateCustomerDefaultPaymentMethod(
      user.stripeCustomerId!,
      user.defaultPaymentMethodId,
    );
    const created = await this.stripeService.createBillingSubscription({
      customerId: user.stripeCustomerId!,
      priceId: this.getBillingPriceId(),
      userId: user.id,
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

  private getCurrentBillingPeriod(d = new Date()): {
    key: string;
    start: Date;
    end: Date;
  } {
    return {
      key: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
      start: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)),
      end: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)),
    };
  }

  async checkBillingHealth(): Promise<{
    meterEventName: string;
    priceId: string;
  }> {
    return {
      meterEventName: await this.stripeService.getBillingMeterEventName(
        this.getBillingPriceId(),
      ),
      priceId: this.getBillingPriceId(),
    };
  }

  private getBillingPriceId(): string {
    if (!this.billingPriceId)
      throw new Error('STRIPE_BILLING_METERED_PRICE_ID not configured');
    return this.billingPriceId;
  }
}
