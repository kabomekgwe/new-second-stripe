import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { BillingSubscriptionStatus } from '@stripe-app/shared';
import { PostgresService } from '../../database/postgres.service';

@Injectable()
export class SubscriptionHandler {
  private readonly logger = new Logger(SubscriptionHandler.name);

  constructor(
    private readonly database: PostgresService,
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
      'SELECT id FROM billing_subscriptions WHERE "stripeSubscriptionId" = $1 LIMIT 1',
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
      `
        UPDATE billing_subscriptions
        SET
          status = $2,
          "cancelAtPeriodEnd" = false,
          "canceledAt" = $3,
          "updatedAt" = now()
        WHERE id = $1
      `,
      [
        existing.id,
        BillingSubscriptionStatus.CANCELED,
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

    await this.database.query(
      `
        INSERT INTO billing_subscriptions (
          id,
          "userId",
          "stripeSubscriptionId",
          "stripeSubscriptionItemId",
          "stripePriceId",
          status,
          "currentPeriodStart",
          "currentPeriodEnd",
          "cancelAtPeriodEnd",
          "canceledAt"
        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT ("stripeSubscriptionId") DO UPDATE SET
          "userId" = EXCLUDED."userId",
          "stripeSubscriptionItemId" = EXCLUDED."stripeSubscriptionItemId",
          "stripePriceId" = EXCLUDED."stripePriceId",
          status = EXCLUDED.status,
          "currentPeriodStart" = EXCLUDED."currentPeriodStart",
          "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
          "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd",
          "canceledAt" = EXCLUDED."canceledAt",
          "updatedAt" = now()
      `,
      [
        user.id,
        subscription.id,
        subscriptionItem.id,
        subscriptionItem.price.id,
        subscription.status as BillingSubscriptionStatus,
        periodStart,
        periodEnd,
        subscription.cancel_at_period_end,
        subscription.canceled_at
          ? new Date(subscription.canceled_at * 1000)
          : null,
      ],
    );
  }

  private async findUser(
    subscription: Stripe.Subscription,
  ): Promise<{ id: string } | null> {
    const metadataUserId = subscription.metadata?.userId;
    if (metadataUserId) {
      const userResult = await this.database.query<{ id: string }>(
        'SELECT id FROM users WHERE id = $1 LIMIT 1',
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
      'SELECT id FROM users WHERE "stripeCustomerId" = $1 LIMIT 1',
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
