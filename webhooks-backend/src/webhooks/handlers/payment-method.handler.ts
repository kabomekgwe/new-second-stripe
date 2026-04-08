import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { OracleService } from '../../database/oracle.service';
import type { DbConnection } from '../../database/oracle.service';

const boolToNum = (v?: boolean): number => v ? 1 : 0;

@Injectable()
export class PaymentMethodHandler {
  private readonly logger = new Logger(PaymentMethodHandler.name);

  constructor(
    private readonly database: OracleService,
  ) {}

  async handleAttached(event: Stripe.Event): Promise<void> {
    const stripePm = event.data.object as Stripe.PaymentMethod;
    const customerId = stripePm.customer as string;

    if (!customerId) {
      this.logger.warn(`Payment method ${stripePm.id} has no customer`);
      return;
    }

    const userResult = await this.database.query<{
      id: string;
      defaultPaymentMethodId: string | null;
    }>(
      'SELECT id, "defaultPaymentMethodId" FROM users WHERE "stripeCustomerId" = :1 FETCH FIRST 1 ROWS ONLY',
      [customerId],
    );
    const user = userResult.rows[0];

    if (!user) {
      this.logger.warn(`No user found for Stripe customer ${customerId}`);
      return;
    }

    const pmData = {
      userId: user.id,
      stripePaymentMethodId: stripePm.id,
      type: stripePm.type,
      last4: stripePm.card?.last4 ?? null,
      brand: stripePm.card?.brand ?? null,
      expiryMonth: stripePm.card?.exp_month ?? null,
      expiryYear: stripePm.card?.exp_year ?? null,
      billingEmailAddress: stripePm.billing_details?.email ?? null,
      billingName: stripePm.billing_details?.name ?? null,
      stripeMetadata: stripePm.metadata ?? {},
    };

    await this.upsertPaymentMethod(stripePm.id, pmData);

    if (!user.defaultPaymentMethodId) {
      await this.setDefaultPaymentMethod(user.id, stripePm.id);
    }

    this.logger.log(
      `Synced attached payment method ${stripePm.id} for user ${user.id}`,
    );
  }

  async handleDetached(event: Stripe.Event): Promise<void> {
    const stripePm = event.data.object as Stripe.PaymentMethod;

    const existingResult = await this.database.query<{
      id: string;
      userId: string;
    }>(
      'SELECT id, "userId" FROM payment_methods WHERE "stripePaymentMethodId" = :1 FETCH FIRST 1 ROWS ONLY',
      [stripePm.id],
    );
    const existing = existingResult.rows[0];

    if (!existing) {
      this.logger.debug(
        `Payment method ${stripePm.id} not found in DB, skipping detach`,
      );
      return;
    }

    const userId = existing.userId;
    await this.database.query(
      'DELETE FROM payment_methods WHERE id = :1',
      [existing.id],
    );

    const userResult = await this.database.query<{
      defaultPaymentMethodId: string | null;
    }>(
      'SELECT "defaultPaymentMethodId" FROM users WHERE id = :1 FETCH FIRST 1 ROWS ONLY',
      [userId],
    );
    const user = userResult.rows[0];

    if (user?.defaultPaymentMethodId === stripePm.id) {
      await this.database.query(
        'UPDATE users SET "defaultPaymentMethodId" = NULL, "updatedAt" = SYSTIMESTAMP WHERE id = :1',
        [userId],
      );
    }

    this.logger.log(
      `Removed detached payment method ${stripePm.id} for user ${userId}`,
    );
  }

  private async upsertPaymentMethod(
    stripePaymentMethodId: string,
    pmData: {
      userId: string;
      stripePaymentMethodId: string;
      type: string;
      last4: string | null;
      brand: string | null;
      expiryMonth: number | null;
      expiryYear: number | null;
      billingEmailAddress: string | null;
      billingName: string | null;
      stripeMetadata: Record<string, unknown>;
    },
  ): Promise<void> {
    const newId = randomUUID();
    await this.database.query(
      `MERGE INTO "payment_methods" t
       USING (SELECT :1 AS "stripePaymentMethodId" FROM DUAL) s
       ON (t."stripePaymentMethodId" = s."stripePaymentMethodId")
       WHEN MATCHED THEN UPDATE SET
         "userId" = :2, "type" = :3, "last4" = :4, "brand" = :5,
         "expiryMonth" = :6, "expiryYear" = :7, "billingEmailAddress" = :8,
         "billingName" = :9, "stripeMetadata" = :10, "updatedAt" = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         "id", "userId", "stripePaymentMethodId", "type", "last4", "brand",
         "expiryMonth", "expiryYear", "billingEmailAddress", "billingName", "stripeMetadata"
       ) VALUES (:11, :2, :1, :3, :4, :5, :6, :7, :8, :9, :10)`,
      [
        stripePaymentMethodId,
        pmData.userId,
        pmData.type,
        pmData.last4,
        pmData.brand,
        pmData.expiryMonth,
        pmData.expiryYear,
        pmData.billingEmailAddress,
        pmData.billingName,
        JSON.stringify(pmData.stripeMetadata),
        newId,
      ],
    );
  }

  private async setDefaultPaymentMethod(
    userId: string,
    stripePaymentMethodId: string,
  ): Promise<void> {
    await this.database.transaction(async (connection: DbConnection) => {
      await this.database.query(
        'UPDATE payment_methods SET "isDefault" = :2, "updatedAt" = SYSTIMESTAMP WHERE "userId" = :1',
        [userId, boolToNum(false)],
        connection,
      );
      await this.database.query(
        `UPDATE payment_methods
         SET "isDefault" = :3, "updatedAt" = SYSTIMESTAMP
         WHERE "userId" = :1 AND "stripePaymentMethodId" = :2`,
        [userId, stripePaymentMethodId, boolToNum(true)],
        connection,
      );
      await this.database.query(
        'UPDATE users SET "defaultPaymentMethodId" = :2, "updatedAt" = SYSTIMESTAMP WHERE id = :1',
        [userId, stripePaymentMethodId],
        connection,
      );
    });
  }
}
