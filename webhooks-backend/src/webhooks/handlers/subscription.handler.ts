import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { BillingSubscriptionStatus } from '@stripe-app/shared';
import { OracleService } from '../../database/oracle.service';

const boolToNum = (v?: boolean): number => v ? 1 : 0;

@Injectable()
export class SubscriptionHandler {
  private readonly logger = new Logger(SubscriptionHandler.name);

  constructor(
    private readonly database: OracleService,
  ) {}

  async handleCreated(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    await this.upsertSubscription(subscription);
  }

  async handleUpdated(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    await this.upsertSubscription(subscription);
  }

  async handleDeleted(event: Stripe.Event): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    const existingResult = await this.database.query<{ id: string }>(
      'SELECT id FROM billing_subscriptions WHERE "stripeSubscriptionId" = :1 FETCH FIRST 1 ROWS ONLY',
      [subscription.id],
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      this.logger.debug(
        `No local subscription found for deleted Stripe subscription ${subscription.id}`,
      );
      return;
    }

    await this.database.query(
      `UPDATE billing_subscriptions
       SET
         status = :2,
         "cancelAtPeriodEnd" = :3,
         "canceledAt" = :4,
         "updatedAt" = SYSTIMESTAMP
       WHERE id = :1`,
      [
        existing.id,
        BillingSubscriptionStatus.CANCELED,
        boolToNum(false),
        subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : new Date(),
      ],
    );
  }

  private async upsertSubscription(
    subscription: Stripe.Subscription,
  ): Promise<void> {
    const rawSub = subscription as unknown as Record<string, unknown>;
    const periodStart = typeof rawSub.current_period_start === 'number'
      ? new Date(rawSub.current_period_start * 1000)
      : null;
    const periodEnd = typeof rawSub.current_period_end === 'number'
      ? new Date(rawSub.current_period_end * 1000)
      : null;
    const user = await this.findUser(subscription);
    if (!user) {
      this.logger.warn(
        `No user found for Stripe subscription ${subscription.id}`,
      );
      return;
    }

    const subscriptionItem = subscription.items.data[0];
    if (!subscriptionItem) {
      this.logger.warn(
        `Stripe subscription ${subscription.id} does not include a subscription item`,
      );
      return;
    }

    const newId = randomUUID();
    await this.database.query(
      `MERGE INTO "billing_subscriptions" t
       USING (SELECT :1 AS "stripeSubscriptionId" FROM DUAL) s
       ON (t."stripeSubscriptionId" = s."stripeSubscriptionId")
       WHEN MATCHED THEN UPDATE SET
         "userId" = :2, "stripeSubscriptionItemId" = :3, "stripePriceId" = :4,
         "status" = :5, "currentPeriodStart" = :6, "currentPeriodEnd" = :7,
         "cancelAtPeriodEnd" = :8, "canceledAt" = :9, "updatedAt" = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         "id", "userId", "stripeSubscriptionId", "stripeSubscriptionItemId",
         "stripePriceId", "status", "currentPeriodStart", "currentPeriodEnd",
         "cancelAtPeriodEnd", "canceledAt"
       ) VALUES (:10, :2, :1, :3, :4, :5, :6, :7, :8, :9)`,
      [
        subscription.id,
        user.id,
        subscriptionItem.id,
        subscriptionItem.price.id,
        subscription.status as BillingSubscriptionStatus,
        periodStart,
        periodEnd,
        boolToNum(subscription.cancel_at_period_end),
        subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null,
        newId,
      ],
    );
  }

  private async findUser(
    subscription: Stripe.Subscription,
  ): Promise<{ id: string } | null> {
    const metadataUserId = subscription.metadata?.userId;
    if (metadataUserId) {
      const userResult = await this.database.query<{ id: string }>(
        'SELECT id FROM users WHERE id = :1 FETCH FIRST 1 ROWS ONLY',
        [metadataUserId],
      );
      return userResult.rows[0] ?? null;
    }

    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer?.id;
    if (!customerId) {
      return null;
    }

    const userResult = await this.database.query<{ id: string }>(
      'SELECT id FROM users WHERE "stripeCustomerId" = :1 FETCH FIRST 1 ROWS ONLY',
      [customerId],
    );
    return userResult.rows[0] ?? null;
  }

  private toPeriodDate(timestamp: number | null): Date | null {
    if (!timestamp) {
      return null;
    }

    const value = new Date(timestamp * 1000);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  private toPeriodEndDate(timestamp: number | null): Date | null {
    if (!timestamp) {
      return null;
    }

    const value = new Date((timestamp - 1) * 1000);
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
}
