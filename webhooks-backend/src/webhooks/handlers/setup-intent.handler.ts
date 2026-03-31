import { Injectable, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { StripeService } from '../../stripe/stripe.service';
import { PostgresService } from '../../database/postgres.service';

@Injectable()
export class SetupIntentHandler {
  private readonly logger = new Logger(SetupIntentHandler.name);

  constructor(
    private readonly database: PostgresService,
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
      'SELECT id, "defaultPaymentMethodId" FROM users WHERE "stripeCustomerId" = $1 LIMIT 1',
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
        user.id,
        stripePm.id,
        stripePm.type,
        stripePm.card?.last4 ?? null,
        stripePm.card?.brand ?? null,
        stripePm.card?.exp_month ?? null,
        stripePm.card?.exp_year ?? null,
        stripePm.billing_details?.email ?? null,
        stripePm.billing_details?.name ?? null,
        JSON.stringify(stripePm.metadata ?? {}),
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
