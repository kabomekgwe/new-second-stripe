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
    const where = ['id = :1'];
    if (userId) {
      params.push(userId);
      where.push(`"userId" = :${params.length}`);
    }

    const result = await this.database.query(
      `SELECT * FROM payment_methods WHERE ${where.join(' AND ')} FETCH FIRST 1 ROWS ONLY`,
      params,
    );
    return result.rows[0] ? mapPaymentMethod(result.rows[0]) : null;
  }

  async findByStripePaymentMethodId(
    stripePaymentMethodId: string,
  ): Promise<PaymentMethod | null> {
    const result = await this.database.query(
      'SELECT * FROM payment_methods WHERE "stripePaymentMethodId" = :1 FETCH FIRST 1 ROWS ONLY',
      [stripePaymentMethodId],
    );
    return result.rows[0] ? mapPaymentMethod(result.rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<PaymentMethod[]> {
    const result = await this.database.query(
      'SELECT * FROM payment_methods WHERE "userId" = :1 ORDER BY "createdAt" DESC',
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
      `MERGE INTO "payment_methods" t
       USING (SELECT :3 AS "stripePaymentMethodId" FROM DUAL) s
       ON (t."stripePaymentMethodId" = s."stripePaymentMethodId")
       WHEN MATCHED THEN UPDATE SET
         "userId" = :2,
         type = :4,
         "isDefault" = :5,
         last4 = :6,
         brand = :7,
         "expiryMonth" = :8,
         "expiryYear" = :9,
         metadata = :10,
         "updatedAt" = SYSTIMESTAMP
       WHEN NOT MATCHED THEN INSERT (
         id, "userId", "stripePaymentMethodId", type, "isDefault",
         last4, brand, "expiryMonth", "expiryYear", metadata
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
      'SELECT * FROM payment_methods WHERE "stripePaymentMethodId" = :1',
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
        `MERGE INTO "payment_methods" t
         USING (SELECT :3 AS "stripePaymentMethodId" FROM DUAL) s
         ON (t."stripePaymentMethodId" = s."stripePaymentMethodId")
         WHEN MATCHED THEN UPDATE SET
           "userId" = :2,
           type = :4,
           "isDefault" = :5,
           last4 = :6,
           brand = :7,
           "expiryMonth" = :8,
           "expiryYear" = :9,
           metadata = :10,
           "updatedAt" = SYSTIMESTAMP
         WHEN NOT MATCHED THEN INSERT (
           id, "userId", "stripePaymentMethodId", type, "isDefault",
           last4, brand, "expiryMonth", "expiryYear", metadata
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
        'SELECT * FROM payment_methods WHERE "stripePaymentMethodId" = :1',
        [data.stripePaymentMethodId],
        connection,
      );
      const pm = selectResult.rows[0];

      if (!currentDefaultId) {
        await this.database.query(
          'UPDATE payment_methods SET "isDefault" = 0 WHERE "userId" = :1',
          [data.userId],
          connection,
        );
        await this.database.query(
          'UPDATE payment_methods SET "isDefault" = 1 WHERE id = :1',
          [pm.id],
          connection,
        );
        await this.database.query(
          'UPDATE users SET "defaultPaymentMethodId" = :2 WHERE id = :1',
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
        'UPDATE payment_methods SET "isDefault" = 0, "updatedAt" = SYSTIMESTAMP WHERE "userId" = :1',
        [userId],
        connection,
      );

      if (stripePaymentMethodId) {
        await this.database.query(
          `UPDATE payment_methods
           SET "isDefault" = 1, "updatedAt" = SYSTIMESTAMP
           WHERE "userId" = :1 AND "stripePaymentMethodId" = :2`,
          [userId, stripePaymentMethodId],
          connection,
        );
      }
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.database.query('DELETE FROM payment_methods WHERE id = :1', [id]);
  }
}
