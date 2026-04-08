import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@stripe-app/shared';
import type { DbConnection } from '../database/oracle.service';
import { randomUUID } from 'crypto';
import { OracleService } from '../database/oracle.service';
import { mapPaymentMethod } from '../database/sql-mappers';

const boolToNum = (v?: boolean): number => v ? 1 : 0;

@Injectable()
export class PaymentMethodsSqlService {
  constructor(private readonly database: OracleService) {}

  async findById(id: string, userId?: string): Promise<PaymentMethod | null> {
    const params: unknown[] = [id];
    const where = ['ID = :1'];
    if (userId) {
      params.push(userId);
      where.push(`USER_ID = :${params.length}`);
    }

    const result = await this.database.query(
      `SELECT * FROM STRIPE_PAYMENT_METHODS WHERE ${where.join(' AND ')} FETCH FIRST 1 ROWS ONLY`,
      params,
    );
    return result.rows[0] ? mapPaymentMethod(result.rows[0]) : null;
  }

  async findByStripePaymentMethodId(
    stripePaymentMethodId: string,
  ): Promise<PaymentMethod | null> {
    const result = await this.database.query(
      'SELECT * FROM STRIPE_PAYMENT_METHODS WHERE STRIPE_PAYMENT_METHOD_ID = :1 FETCH FIRST 1 ROWS ONLY',
      [stripePaymentMethodId],
    );
    return result.rows[0] ? mapPaymentMethod(result.rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<PaymentMethod[]> {
    const result = await this.database.query(
      'SELECT * FROM STRIPE_PAYMENT_METHODS WHERE USER_ID = :1 ORDER BY CREATED_AT DESC',
      [userId],
    );
    return result.rows.map(mapPaymentMethod);
  }

  async upsertFromStripe(
    data: Partial<PaymentMethod> & {
      userId: string;
      stripePaymentMethodId: string;
      type: string;
    },
  ): Promise<PaymentMethod> {
    await this.database.query(
      `MERGE INTO STRIPE_PAYMENT_METHODS t
       USING (SELECT :3 AS STRIPE_PAYMENT_METHOD_ID FROM DUAL) s
       ON (t.STRIPE_PAYMENT_METHOD_ID = s.STRIPE_PAYMENT_METHOD_ID)
       WHEN MATCHED THEN UPDATE SET
         USER_ID = :2,
         METHOD_TYPE = :4,
         IS_DEFAULT = :5,
         LAST4 = :6,
         BRAND = :7,
         EXPIRY_MONTH = :8,
         EXPIRY_YEAR = :9,
         METADATA = :10,
         UPDATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         ID, USER_ID, STRIPE_PAYMENT_METHOD_ID, METHOD_TYPE, IS_DEFAULT,
         LAST4, BRAND, EXPIRY_MONTH, EXPIRY_YEAR, METADATA
       ) VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9, :10)`,
      [
        randomUUID(),
        data.userId,
        data.stripePaymentMethodId,
        data.type,
        boolToNum(data.isDefault ?? false),
        data.last4 ?? null,
        data.brand ?? null,
        data.expiryMonth ?? null,
        data.expiryYear ?? null,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );

    const result = await this.database.query(
      'SELECT * FROM STRIPE_PAYMENT_METHODS WHERE STRIPE_PAYMENT_METHOD_ID = :1',
      [data.stripePaymentMethodId],
    );
    return mapPaymentMethod(result.rows[0]);
  }

  async upsertFromStripeTX(
    data: Partial<PaymentMethod> & {
      userId: string;
      stripePaymentMethodId: string;
      type: string;
    },
    currentDefaultId: string | null,
  ): Promise<PaymentMethod> {
    const result = await this.database.transaction(async (connection: DbConnection) => {
      await this.database.query(
        `MERGE INTO STRIPE_PAYMENT_METHODS t
         USING (SELECT :3 AS STRIPE_PAYMENT_METHOD_ID FROM DUAL) s
         ON (t.STRIPE_PAYMENT_METHOD_ID = s.STRIPE_PAYMENT_METHOD_ID)
         WHEN MATCHED THEN UPDATE SET
           USER_ID = :2,
           METHOD_TYPE = :4,
           IS_DEFAULT = :5,
           LAST4 = :6,
           BRAND = :7,
           EXPIRY_MONTH = :8,
           EXPIRY_YEAR = :9,
           METADATA = :10,
           UPDATED_AT = SYSTIMESTAMP
         WHEN NOT MATCHED THEN INSERT (
           ID, USER_ID, STRIPE_PAYMENT_METHOD_ID, METHOD_TYPE, IS_DEFAULT,
           LAST4, BRAND, EXPIRY_MONTH, EXPIRY_YEAR, METADATA
         ) VALUES (:1, :2, :3, :4, :5, :6, :7, :8, :9, :10)`,
        [
          randomUUID(),
          data.userId,
          data.stripePaymentMethodId,
          data.type,
          boolToNum(data.isDefault ?? false),
          data.last4 ?? null,
          data.brand ?? null,
          data.expiryMonth ?? null,
          data.expiryYear ?? null,
          data.metadata ? JSON.stringify(data.metadata) : null,
        ],
        connection,
      );

      const selectResult = await this.database.query(
        'SELECT * FROM STRIPE_PAYMENT_METHODS WHERE STRIPE_PAYMENT_METHOD_ID = :1',
        [data.stripePaymentMethodId],
        connection,
      );
      const pm = selectResult.rows[0];

      if (!currentDefaultId) {
        await this.database.query(
          'UPDATE STRIPE_PAYMENT_METHODS SET IS_DEFAULT = 0 WHERE USER_ID = :1',
          [data.userId],
          connection,
        );
        await this.database.query(
          'UPDATE STRIPE_PAYMENT_METHODS SET IS_DEFAULT = 1 WHERE ID = :1',
          [pm.id],
          connection,
        );
        await this.database.query(
          'UPDATE USERS SET DEFAULT_PAYMENT_METHOD_ID = :2 WHERE ID = :1',
          [data.userId, data.stripePaymentMethodId],
          connection,
        );
        pm.isDefault = true;
      }

      return pm;
    });

    return mapPaymentMethod(result);
  }

  async setDefault(
    userId: string,
    stripePaymentMethodId: string | null,
  ): Promise<void> {
    await this.database.transaction(async (connection: DbConnection) => {
      await this.database.query(
        'UPDATE STRIPE_PAYMENT_METHODS SET IS_DEFAULT = 0, UPDATED_AT = SYSTIMESTAMP WHERE USER_ID = :1',
        [userId],
        connection,
      );

      if (stripePaymentMethodId) {
        await this.database.query(
          `UPDATE STRIPE_PAYMENT_METHODS
           SET IS_DEFAULT = 1, UPDATED_AT = SYSTIMESTAMP
           WHERE USER_ID = :1 AND STRIPE_PAYMENT_METHOD_ID = :2`,
          [userId, stripePaymentMethodId],
          connection,
        );
      }
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.database.query('DELETE FROM STRIPE_PAYMENT_METHODS WHERE ID = :1', [id]);
  }
}
