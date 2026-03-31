import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PostgresService } from '../../database/postgres.service';

@Injectable()
export class PaymentMethodHandler {
  private readonly logger = new Logger(PaymentMethodHandler.name);

  constructor(
    private readonly database: PostgresService,
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
      'SELECT id, "defaultPaymentMethodId" FROM users WHERE "stripeCustomerId" = $1 LIMIT 1',
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
      'SELECT id, "userId" FROM payment_methods WHERE "stripePaymentMethodId" = $1 LIMIT 1',
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
      'DELETE FROM payment_methods WHERE id = $1',
      [existing.id],
    );

    const userResult = await this.database.query<{
      defaultPaymentMethodId: string | null;
    }>(
      'SELECT "defaultPaymentMethodId" FROM users WHERE id = $1 LIMIT 1',
      [userId],
    );
    const user = userResult.rows[0];

    if (user?.defaultPaymentMethodId === stripePm.id) {
      await this.database.query(
        'UPDATE users SET "defaultPaymentMethodId" = NULL, "updatedAt" = now() WHERE id = $1',
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
    await this.database.query(
      `
        INSERT INTO payment_methods (
          id,
          "userId",
          "stripePaymentMethodId",
          type,
          last4,
          brand,
          "expiryMonth",
          "expiryYear",
          "billingEmailAddress",
          "billingName",
          "stripeMetadata"
        ) VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT ("stripePaymentMethodId") DO UPDATE SET
          "userId" = EXCLUDED."userId",
          type = EXCLUDED.type,
          last4 = EXCLUDED.last4,
          brand = EXCLUDED.brand,
          "expiryMonth" = EXCLUDED."expiryMonth",
          "expiryYear" = EXCLUDED."expiryYear",
          "billingEmailAddress" = EXCLUDED."billingEmailAddress",
          "billingName" = EXCLUDED."billingName",
          "stripeMetadata" = EXCLUDED."stripeMetadata",
          "updatedAt" = now()
      `,
      [
        pmData.userId,
        stripePaymentMethodId,
        pmData.type,
        pmData.last4,
        pmData.brand,
        pmData.expiryMonth,
        pmData.expiryYear,
        pmData.billingEmailAddress,
        pmData.billingName,
        JSON.stringify(pmData.stripeMetadata),
      ],
    );
  }

  private async setDefaultPaymentMethod(
    userId: string,
    stripePaymentMethodId: string,
  ): Promise<void> {
    await this.database.transaction(async (client) => {
      await this.database.query(
        'UPDATE payment_methods SET "isDefault" = false, "updatedAt" = now() WHERE "userId" = $1',
        [userId],
        client,
      );
      await this.database.query(
        `UPDATE payment_methods
         SET "isDefault" = true, "updatedAt" = now()
         WHERE "userId" = $1 AND "stripePaymentMethodId" = $2`,
        [userId, stripePaymentMethodId],
        client,
      );
      await this.database.query(
        'UPDATE users SET "defaultPaymentMethodId" = $2, "updatedAt" = now() WHERE id = $1',
        [userId, stripePaymentMethodId],
        client,
      );
    });
  }
}
