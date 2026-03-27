import { Injectable } from '@nestjs/common';
import {
  BillingSubscription,
  ChargeStatus,
  BillingSubscriptionStatus,
  UsageCharge,
  User,
} from '@stripe-app/shared';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { PostgresService } from '../database/postgres.service';
import {
  mapBillingSubscription,
  mapUsageCharge,
  mapUser,
} from '../database/sql-mappers';

@Injectable()
export class BillingSqlService {
  constructor(private readonly database: PostgresService) {}

  async findBillableUsers(): Promise<User[]> {
    const result = await this.database.query(
      `SELECT * FROM users
       WHERE "monthlyManagementFee" > 0
         AND "defaultPaymentMethodId" IS NOT NULL
         AND "stripeCustomerId" IS NOT NULL`,
    );
    return result.rows.map(mapUser);
  }

  async findUsageChargeByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<UsageCharge | null> {
    const result = await this.database.query(
      'SELECT * FROM usage_charges WHERE "idempotencyKey" = $1 LIMIT 1',
      [idempotencyKey],
    );
    return result.rows[0] ? mapUsageCharge(result.rows[0]) : null;
  }

  async listUsageChargesByUserId(userId: string): Promise<UsageCharge[]> {
    const result = await this.database.query(
      'SELECT * FROM usage_charges WHERE "userId" = $1 ORDER BY "billingPeriodStart" DESC',
      [userId],
    );
    return result.rows.map(mapUsageCharge);
  }

  async upsertUsageCharge(
    data: Omit<UsageCharge, 'id' | 'createdAt' | 'updatedAt' | 'user'>,
  ): Promise<UsageCharge> {
    const result = await this.database.query(
      `INSERT INTO usage_charges (
        id,
        "userId",
        "stripeInvoiceId",
        "stripeSubscriptionId",
        "stripeSubscriptionItemId",
        "stripePaymentIntentId",
        "amountGbp",
        description,
        "billingPeriodStart",
        "billingPeriodEnd",
        status,
        "idempotencyKey",
        "usageReportedAt"
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT ("idempotencyKey") DO UPDATE SET
        "stripeInvoiceId" = EXCLUDED."stripeInvoiceId",
        "stripeSubscriptionId" = EXCLUDED."stripeSubscriptionId",
        "stripeSubscriptionItemId" = EXCLUDED."stripeSubscriptionItemId",
        "stripePaymentIntentId" = EXCLUDED."stripePaymentIntentId",
        "amountGbp" = EXCLUDED."amountGbp",
        description = EXCLUDED.description,
        "billingPeriodStart" = EXCLUDED."billingPeriodStart",
        "billingPeriodEnd" = EXCLUDED."billingPeriodEnd",
        status = EXCLUDED.status,
        "usageReportedAt" = EXCLUDED."usageReportedAt",
        "updatedAt" = NOW()
      RETURNING *`,
      [
        randomUUID(),
        data.userId,
        data.stripeInvoiceId ?? null,
        data.stripeSubscriptionId ?? null,
        data.stripeSubscriptionItemId ?? null,
        data.stripePaymentIntentId ?? null,
        data.amountGbp,
        data.description ?? null,
        data.billingPeriodStart,
        data.billingPeriodEnd,
        data.status,
        data.idempotencyKey,
        data.usageReportedAt ?? null,
      ],
    );

    return mapUsageCharge(result.rows[0]);
  }

  async findBillingSubscriptionByUserId(
    userId: string,
  ): Promise<BillingSubscription | null> {
    const result = await this.database.query(
      'SELECT * FROM billing_subscriptions WHERE "userId" = $1 ORDER BY "updatedAt" DESC LIMIT 1',
      [userId],
    );
    return result.rows[0] ? mapBillingSubscription(result.rows[0]) : null;
  }

  async findBillingSubscriptionByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<BillingSubscription | null> {
    const result = await this.database.query(
      'SELECT * FROM billing_subscriptions WHERE "stripeSubscriptionId" = $1 LIMIT 1',
      [stripeSubscriptionId],
    );
    return result.rows[0] ? mapBillingSubscription(result.rows[0]) : null;
  }

  async upsertBillingSubscription(
    data: Omit<BillingSubscription, 'id' | 'createdAt' | 'updatedAt' | 'user'>,
  ): Promise<BillingSubscription> {
    const result = await this.database.query(
      `INSERT INTO billing_subscriptions (
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
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT ("stripeSubscriptionId") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        "stripeSubscriptionItemId" = EXCLUDED."stripeSubscriptionItemId",
        "stripePriceId" = EXCLUDED."stripePriceId",
        status = EXCLUDED.status,
        "currentPeriodStart" = EXCLUDED."currentPeriodStart",
        "currentPeriodEnd" = EXCLUDED."currentPeriodEnd",
        "cancelAtPeriodEnd" = EXCLUDED."cancelAtPeriodEnd",
        "canceledAt" = EXCLUDED."canceledAt",
        "updatedAt" = NOW()
      RETURNING *`,
      [
        randomUUID(),
        data.userId,
        data.stripeSubscriptionId,
        data.stripeSubscriptionItemId,
        data.stripePriceId,
        data.status,
        data.currentPeriodStart ?? null,
        data.currentPeriodEnd ?? null,
        data.cancelAtPeriodEnd,
        data.canceledAt ?? null,
      ],
    );

    return mapBillingSubscription(result.rows[0]);
  }

  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(callback);
  }

  async clearBillingSubscription(
    stripeSubscriptionId: string,
  ): Promise<void> {
    await this.database.query(
      'DELETE FROM billing_subscriptions WHERE "stripeSubscriptionId" = $1',
      [stripeSubscriptionId],
    );
  }
}
