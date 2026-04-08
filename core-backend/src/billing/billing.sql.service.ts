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
      `SELECT * FROM USERS
       WHERE MONTHLY_MANAGEMENT_FEE > 0
         AND DEFAULT_PAYMENT_METHOD_ID IS NOT NULL
         AND STRIPE_CUSTOMER_ID IS NOT NULL`,
    );
    return result.rows.map(mapUser);
  }

  async findUsageChargeByIdempotencyKey(
    idempotencyKey: string,
  ): Promise<UsageCharge | null> {
    const result = await this.database.query(
      'SELECT * FROM STRIPE_USAGE_CHARGES WHERE IDEMPOTENCY_KEY = :1 FETCH FIRST 1 ROWS ONLY',
      [idempotencyKey],
    );
    return result.rows[0] ? mapUsageCharge(result.rows[0]) : null;
  }

  async listUsageChargesByUserId(userId: string): Promise<UsageCharge[]> {
    const result = await this.database.query(
      'SELECT * FROM STRIPE_USAGE_CHARGES WHERE USER_ID = :1 ORDER BY BILLING_PERIOD_START DESC',
      [userId],
    );
    return result.rows.map(mapUsageCharge);
  }

  async upsertUsageCharge(
    data: Omit<UsageCharge, 'id' | 'createdAt' | 'updatedAt' | 'user'>,
  ): Promise<UsageCharge> {
    await this.database.query(
      `MERGE INTO STRIPE_USAGE_CHARGES t
       USING (SELECT :1 AS IDEMPOTENCY_KEY FROM DUAL) s
       ON (t.IDEMPOTENCY_KEY = s.IDEMPOTENCY_KEY)
       WHEN MATCHED THEN UPDATE SET
         STRIPE_INVOICE_ID = :2,
         STRIPE_SUBSCRIPTION_ID = :3,
         STRIPE_SUBSCRIPTION_ITEM_ID = :4,
         STRIPE_PAYMENT_INTENT_ID = :5,
         AMOUNT_GBP = :6,
         DESCRIPTION = :7,
         BILLING_PERIOD_START = :8,
         BILLING_PERIOD_END = :9,
         STATUS = :10,
         USAGE_REPORTED_AT = :11,
         UPDATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         ID, USER_ID, STRIPE_INVOICE_ID, STRIPE_SUBSCRIPTION_ID,
         STRIPE_SUBSCRIPTION_ITEM_ID, STRIPE_PAYMENT_INTENT_ID, AMOUNT_GBP,
         DESCRIPTION, BILLING_PERIOD_START, BILLING_PERIOD_END, STATUS,
         IDEMPOTENCY_KEY, USAGE_REPORTED_AT
       ) VALUES (:12,:13,:2,:3,:4,:5,:6,:7,:8,:9,:10,:1,:11)`,
      [
        data.idempotencyKey,
        data.stripeInvoiceId ?? null,
        data.stripeSubscriptionId ?? null,
        data.stripeSubscriptionItemId ?? null,
        data.stripePaymentIntentId ?? null,
        data.amountGbp,
        data.description ?? null,
        data.billingPeriodStart,
        data.billingPeriodEnd,
        data.status,
        data.usageReportedAt ?? null,
        randomUUID(),
        data.userId,
      ],
    );

    const result = await this.database.query(
      'SELECT * FROM STRIPE_USAGE_CHARGES WHERE IDEMPOTENCY_KEY = :1',
      [data.idempotencyKey],
    );
    return mapUsageCharge(result.rows[0]);
  }

  async findBillingSubscriptionByUserId(
    userId: string,
  ): Promise<BillingSubscription | null> {
    const result = await this.database.query(
      'SELECT * FROM STRIPE_BILLING_SUBSCRIPTIONS WHERE USER_ID = :1 ORDER BY UPDATED_AT DESC FETCH FIRST 1 ROWS ONLY',
      [userId],
    );
    return result.rows[0] ? mapBillingSubscription(result.rows[0]) : null;
  }

  async findBillingSubscriptionByStripeSubscriptionId(
    stripeSubscriptionId: string,
  ): Promise<BillingSubscription | null> {
    const result = await this.database.query(
      'SELECT * FROM STRIPE_BILLING_SUBSCRIPTIONS WHERE STRIPE_SUBSCRIPTION_ID = :1 FETCH FIRST 1 ROWS ONLY',
      [stripeSubscriptionId],
    );
    return result.rows[0] ? mapBillingSubscription(result.rows[0]) : null;
  }

  async upsertBillingSubscription(
    data: Omit<BillingSubscription, 'id' | 'createdAt' | 'updatedAt' | 'user'>,
  ): Promise<BillingSubscription> {
    await this.database.query(
      `MERGE INTO STRIPE_BILLING_SUBSCRIPTIONS t
       USING (SELECT :1 AS STRIPE_SUBSCRIPTION_ID FROM DUAL) s
       ON (t.STRIPE_SUBSCRIPTION_ID = s.STRIPE_SUBSCRIPTION_ID)
       WHEN MATCHED THEN UPDATE SET
         USER_ID = :2,
         STRIPE_SUBSCRIPTION_ITEM_ID = :3,
         STRIPE_PRICE_ID = :4,
         STATUS = :5,
         CURRENT_PERIOD_START = :6,
         CURRENT_PERIOD_END = :7,
         CANCEL_AT_PERIOD_END = :8,
         CANCELED_AT = :9,
         UPDATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         ID, USER_ID, STRIPE_SUBSCRIPTION_ID, STRIPE_SUBSCRIPTION_ITEM_ID,
         STRIPE_PRICE_ID, STATUS, CURRENT_PERIOD_START, CURRENT_PERIOD_END,
         CANCEL_AT_PERIOD_END, CANCELED_AT
       ) VALUES (:10,:2,:1,:3,:4,:5,:6,:7,:8,:9)`,
      [
        data.stripeSubscriptionId,
        data.userId,
        data.stripeSubscriptionItemId,
        data.stripePriceId,
        data.status,
        data.currentPeriodStart ?? null,
        data.currentPeriodEnd ?? null,
        boolToNum(data.cancelAtPeriodEnd),
        data.canceledAt ?? null,
        randomUUID(),
      ],
    );

    const result = await this.database.query(
      'SELECT * FROM STRIPE_BILLING_SUBSCRIPTIONS WHERE STRIPE_SUBSCRIPTION_ID = :1',
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
      'DELETE FROM STRIPE_BILLING_SUBSCRIPTIONS WHERE STRIPE_SUBSCRIPTION_ID = :1',
      [stripeSubscriptionId],
    );
  }
}
