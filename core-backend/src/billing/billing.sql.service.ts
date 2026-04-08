import { Injectable } from '@nestjs/common';
import {
  BillingSubscription,
  ChargeStatus,
  BillingSubscriptionStatus,
  UsageCharge,
  User,
} from '@stripe-app/shared';
import type { DbConnection } from '../database/oracle.service';
import { randomUUID } from 'crypto';
import { OracleService } from '../database/oracle.service';
import {
  mapBillingSubscription,
  mapUsageCharge,
  mapUser,
} from '../database/sql-mappers';

const boolToNum = (v?: boolean): number => v ? 1 : 0;

@Injectable()
export class BillingSqlService {
  constructor(private readonly database: OracleService) {}

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
      'SELECT * FROM usage_charges WHERE "idempotencyKey" = :1 FETCH FIRST 1 ROWS ONLY',
      [idempotencyKey],
    );
    return result.rows[0] ? mapUsageCharge(result.rows[0]) : null;
  }

  async listUsageChargesByUserId(userId: string): Promise<UsageCharge[]> {
    const result = await this.database.query(
      'SELECT * FROM usage_charges WHERE "userId" = :1 ORDER BY "billingPeriodStart" DESC',
      [userId],
    );
    return result.rows.map(mapUsageCharge);
  }

  async upsertUsageCharge(
    data: Omit<UsageCharge, 'id' | 'createdAt' | 'updatedAt' | 'user'>,
  ): Promise<UsageCharge> {
    await this.database.query(
      `MERGE INTO "usage_charges" t
       USING (SELECT :12 AS "idempotencyKey" FROM DUAL) s
       ON (t."idempotencyKey" = s."idempotencyKey")
       WHEN MATCHED THEN UPDATE SET
         "stripeInvoiceId" = :3,
         "stripeSubscriptionId" = :4,
         "stripeSubscriptionItemId" = :5,
         "stripePaymentIntentId" = :6,
         "amountGbp" = :7,
         description = :8,
         "billingPeriodStart" = :9,
         "billingPeriodEnd" = :10,
         status = :11,
         "usageReportedAt" = :13,
         "updatedAt" = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         id, "userId", "stripeInvoiceId", "stripeSubscriptionId",
         "stripeSubscriptionItemId", "stripePaymentIntentId", "amountGbp",
         description, "billingPeriodStart", "billingPeriodEnd", status,
         "idempotencyKey", "usageReportedAt"
       ) VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12,:13)`,
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

    const result = await this.database.query(
      'SELECT * FROM usage_charges WHERE "idempotencyKey" = :1',
      [data.idempotencyKey],
    );
    return mapUsageCharge(result.rows[0]);
  }

  async findBillingSubscriptionByUserId(
    userId: string,
  ): Promise<BillingSubscription | null> {
    const result = await this.database.query(
      'SELECT * FROM billing_subscriptions WHERE "userId" = :1 ORDER BY "updatedAt" DESC FETCH FIRST 1 ROWS ONLY',
      [userId],
    );
    return result.rows[0] ? mapBillingSubscription(result.rows[0]) : null;
  }

  async findBillingSubscriptionByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<BillingSubscription | null> {
    const result = await this.database.query(
      'SELECT * FROM billing_subscriptions WHERE "stripeSubscriptionId" = :1 FETCH FIRST 1 ROWS ONLY',
      [stripeSubscriptionId],
    );
    return result.rows[0] ? mapBillingSubscription(result.rows[0]) : null;
  }

  async upsertBillingSubscription(
    data: Omit<BillingSubscription, 'id' | 'createdAt' | 'updatedAt' | 'user'>,
  ): Promise<BillingSubscription> {
    await this.database.query(
      `MERGE INTO "billing_subscriptions" t
       USING (SELECT :3 AS "stripeSubscriptionId" FROM DUAL) s
       ON (t."stripeSubscriptionId" = s."stripeSubscriptionId")
       WHEN MATCHED THEN UPDATE SET
         "userId" = :2,
         "stripeSubscriptionItemId" = :4,
         "stripePriceId" = :5,
         status = :6,
         "currentPeriodStart" = :7,
         "currentPeriodEnd" = :8,
         "cancelAtPeriodEnd" = :9,
         "canceledAt" = :10,
         "updatedAt" = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         id, "userId", "stripeSubscriptionId", "stripeSubscriptionItemId",
         "stripePriceId", status, "currentPeriodStart", "currentPeriodEnd",
         "cancelAtPeriodEnd", "canceledAt"
       ) VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10)`,
      [
        randomUUID(),
        data.userId,
        data.stripeSubscriptionId,
        data.stripeSubscriptionItemId,
        data.stripePriceId,
        data.status,
        data.currentPeriodStart ?? null,
        data.currentPeriodEnd ?? null,
        boolToNum(data.cancelAtPeriodEnd),
        data.canceledAt ?? null,
      ],
    );

    const result = await this.database.query(
      'SELECT * FROM billing_subscriptions WHERE "stripeSubscriptionId" = :1',
      [data.stripeSubscriptionId],
    );
    return mapBillingSubscription(result.rows[0]);
  }

  async transaction<T>(
    callback: (connection: DbConnection) => Promise<T>,
  ): Promise<T> {
    return this.database.transaction(callback);
  }

  async clearBillingSubscription(
    stripeSubscriptionId: string,
  ): Promise<void> {
    await this.database.query(
      'DELETE FROM billing_subscriptions WHERE "stripeSubscriptionId" = :1',
      [stripeSubscriptionId],
    );
  }
}
