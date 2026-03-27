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
  private billingMeterEventName: string | null = null;

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
    if (nodeEnv === 'production' && this.billingPriceId.endsWith('_xxx')) {
      throw new Error(
        'STRIPE_BILLING_METERED_PRICE_ID must be configured with a real value',
      );
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
        if (charge.status === ChargeStatus.PROCESSING) {
          results.succeeded++;
        } else {
          results.skipped++;
        }
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
    if (!user.stripeCustomerId) {
      throw new Error(`User ${user.id} does not have a Stripe customer`);
    }

    const subscription = await this.ensureBillingSubscription(user);
    const period = this.getCurrentBillingPeriod();
    const idempotencyKey = generateUniqueIdempotencyKey(
      'usage_charge',
      user.id,
      period.key,
    );
    const existing = await this.billingSql.findUsageChargeByIdempotencyKey(
      idempotencyKey,
    );
    const chargeDescription = description ?? `Management fee – ${period.key}`;
    const usageTimestamp = Math.floor(Date.now() / 1000);

    if (existing) {
      this.logger.log(
        `Usage charge already exists for user ${user.id} period ${period.key}`,
      );
      return existing;
    }

    const eventName = await this.getBillingMeterEventName();
    await this.stripeService.createMeterEvent({
      eventName,
      customerId: user.stripeCustomerId,
      value: amount,
      identifier: idempotencyKey,
      timestamp: usageTimestamp,
    });

    return this.billingSql.upsertUsageCharge({
      userId: user.id,
      stripeInvoiceId: null,
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      stripeSubscriptionItemId: subscription.stripeSubscriptionItemId,
      stripePaymentIntentId: null,
      amountGbp: amount,
      description: chargeDescription,
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
    const localSubscription =
      await this.billingSql.findBillingSubscriptionByUserId(user.id);

    if (
      localSubscription &&
      localSubscription.status !== BillingSubscriptionStatus.CANCELED
    ) {
      return localSubscription;
    }

    const stripeSubscriptions = await this.stripeService.listSubscriptions(
      user.stripeCustomerId!,
    );
    const existingStripeSubscription = stripeSubscriptions.data.find(
      (subscription) =>
        subscription.items.data.some(
          (item) => item.price.id === this.getBillingPriceId(),
        ) && subscription.status !== 'canceled',
    );

    if (existingStripeSubscription) {
      return this.upsertBillingSubscription(user.id, existingStripeSubscription);
    }

    if (!user.defaultPaymentMethodId) {
      throw new Error(
        `User ${user.id} must have a default payment method before billing`,
      );
    }

    await this.stripeService.updateCustomerDefaultPaymentMethod(
      user.stripeCustomerId!,
      user.defaultPaymentMethodId,
    );

    const createdSubscription =
      await this.stripeService.createBillingSubscription({
        customerId: user.stripeCustomerId!,
        priceId: this.getBillingPriceId(),
        userId: user.id,
      });

    return this.upsertBillingSubscription(user.id, createdSubscription);
  }

  private async upsertBillingSubscription(
    userId: string,
    subscription: Stripe.Subscription,
  ): Promise<BillingSubscription> {
    const stripeSubscription = subscription as Stripe.Subscription & {
      current_period_start?: number;
      current_period_end?: number;
    };
    const subscriptionItem = subscription.items.data[0];
    if (!subscriptionItem) {
      throw new Error(
        `Stripe subscription ${subscription.id} does not have a subscription item`,
      );
    }

    return this.billingSql.upsertBillingSubscription({
      userId,
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionItemId: subscriptionItem.id,
      stripePriceId: subscriptionItem.price.id,
      status: subscription.status as BillingSubscriptionStatus,
      currentPeriodStart: stripeSubscription.current_period_start
        ? new Date(stripeSubscription.current_period_start * 1000)
        : null,
      currentPeriodEnd: stripeSubscription.current_period_end
        ? new Date(stripeSubscription.current_period_end * 1000)
        : null,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      canceledAt: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000)
        : null,
    });
  }

  private getCurrentBillingPeriod(referenceDate = new Date()): {
    key: string;
    start: Date;
    end: Date;
  } {
    const start = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      1,
    );
    const end = new Date(
      referenceDate.getFullYear(),
      referenceDate.getMonth() + 1,
      0,
    );
    return {
      key: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`,
      start,
      end,
    };
  }

  private getBillingPriceId(): string {
    if (!this.billingPriceId) {
      throw new Error('STRIPE_BILLING_METERED_PRICE_ID is not configured');
    }

    return this.billingPriceId;
  }

  private async getBillingMeterEventName(): Promise<string> {
    if (this.billingMeterEventName) {
      return this.billingMeterEventName;
    }

    const price = await this.stripeService.retrievePrice(
      this.getBillingPriceId(),
    );
    const meterId = price.recurring?.meter;
    if (!meterId) {
      throw new Error(
        `Price ${this.billingPriceId} is not configured with a billing meter`,
      );
    }

    const meter = await this.stripeService.retrieveBillingMeter(meterId);
    this.billingMeterEventName = meter.event_name;
    return this.billingMeterEventName;
  }
}
