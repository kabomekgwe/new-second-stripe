import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Stripe from 'stripe';
import { StripeService } from '../../stripe/stripe.service';
import { OracleService } from '../../database/oracle.service';
import type { DbConnection } from '../../database/oracle.service';

const boolToNum = (v?: boolean): number => v ? 1 : 0;

@Injectable()
export class SetupIntentHandler {
  private readonly logger = new Logger(SetupIntentHandler.name);

  constructor(
    private readonly database: OracleService,
    private readonly stripeService: StripeService,
  ) {}

  async handleSucceeded(event: Stripe.Event): Promise<void> {
    const setupIntent = event.data.object as Stripe.SetupIntent;
    const customerId = setupIntent.customer as string;
    const paymentMethodId = setupIntent.payment_method as string;

    if (!customerId || !paymentMethodId) {
      this.logger.warn(
        `Setup intent ${setupIntent.id} missing customer or payment_method`,
      );
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

    const stripePm = await this.stripeService
      .getClient()
      .paymentMethods.retrieve(paymentMethodId);

    await this.upsertPaymentMethod(user, stripePm);
    this.logger.log(
      `Synced payment method ${paymentMethodId} for user ${user.id}`,
    );
  }

  private async upsertPaymentMethod(
    user: { id: string; defaultPaymentMethodId: string | null },
    stripePm: Stripe.PaymentMethod,
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
        stripePm.id,
        user.id,
        stripePm.type,
        stripePm.card?.last4 ?? null,
        stripePm.card?.brand ?? null,
        stripePm.card?.exp_month ?? null,
        stripePm.card?.exp_year ?? null,
        stripePm.billing_details?.email ?? null,
        stripePm.billing_details?.name ?? null,
        JSON.stringify(stripePm.metadata ?? {}),
        newId,
      ],
    );

    await this.setDefaultPaymentMethod(user.id, stripePm.id, user.defaultPaymentMethodId);
  }

  private async setDefaultPaymentMethod(
    userId: string,
    stripePaymentMethodId: string,
    existingDefaultId: string | null,
  ): Promise<void> {
    if (existingDefaultId) {
      return;
    }

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
