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
      'SELECT ID, DEFAULT_PAYMENT_METHOD_ID FROM USERS WHERE STRIPE_CUSTOMER_ID = :1 FETCH FIRST 1 ROWS ONLY',
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
      `MERGE INTO STRIPE_PAYMENT_METHODS t
       USING (SELECT :1 AS STRIPE_PAYMENT_METHOD_ID FROM DUAL) s
       ON (t.STRIPE_PAYMENT_METHOD_ID = s.STRIPE_PAYMENT_METHOD_ID)
       WHEN MATCHED THEN UPDATE SET
         USER_ID = :2, METHOD_TYPE = :3, LAST4 = :4, BRAND = :5,
         EXPIRY_MONTH = :6, EXPIRY_YEAR = :7, BILLING_EMAIL_ADDRESS = :8,
         BILLING_NAME = :9, STRIPE_METADATA = :10, UPDATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         ID, USER_ID, STRIPE_PAYMENT_METHOD_ID, METHOD_TYPE, LAST4, BRAND,
         EXPIRY_MONTH, EXPIRY_YEAR, BILLING_EMAIL_ADDRESS, BILLING_NAME, STRIPE_METADATA
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
        'UPDATE STRIPE_PAYMENT_METHODS SET IS_DEFAULT = :2, UPDATED_AT = SYSTIMESTAMP WHERE USER_ID = :1',
        [userId, boolToNum(false)],
        connection,
      );
      await this.database.query(
        `UPDATE STRIPE_PAYMENT_METHODS
         SET IS_DEFAULT = :3, UPDATED_AT = SYSTIMESTAMP
         WHERE USER_ID = :1 AND STRIPE_PAYMENT_METHOD_ID = :2`,
        [userId, stripePaymentMethodId, boolToNum(true)],
        connection,
      );
      await this.database.query(
        'UPDATE USERS SET DEFAULT_PAYMENT_METHOD_ID = :2, UPDATED_AT = SYSTIMESTAMP WHERE ID = :1',
        [userId, stripePaymentMethodId],
        connection,
      );
    });
  }
}
