import { Injectable } from '@nestjs/common';
import { PaymentMethod } from '@stripe-app/shared';
import { PoolClient } from 'pg';
import { randomUUID } from 'crypto';
import { PostgresService } from '../database/postgres.service';
import { mapPaymentMethod } from '../database/sql-mappers';

@Injectable()
export class PaymentMethodsSqlService {
  constructor(private readonly database: PostgresService) {}

  async findById(id: string, userId?: string): Promise<PaymentMethod | null> {
    const params: unknown[] = [id];
    const where = ['id = $1'];
    if (userId) {
      params.push(userId);
      where.push(`"userId" = $${params.length}`);
    }

    const result = await this.database.query(
      `SELECT * FROM payment_methods WHERE ${where.join(' AND ')} LIMIT 1`,
      params,
    );
    return result.rows[0] ? mapPaymentMethod(result.rows[0]) : null;
  }

  async findByStripePaymentMethodId(
    stripePaymentMethodId: string,
  ): Promise<PaymentMethod | null> {
    const result = await this.database.query(
      'SELECT * FROM payment_methods WHERE "stripePaymentMethodId" = $1 LIMIT 1',
      [stripePaymentMethodId],
    );
    return result.rows[0] ? mapPaymentMethod(result.rows[0]) : null;
  }

  async findByUserId(userId: string): Promise<PaymentMethod[]> {
    const result = await this.database.query(
      'SELECT * FROM payment_methods WHERE "userId" = $1 ORDER BY "createdAt" DESC',
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
    const result = await this.database.query(
      `INSERT INTO payment_methods (
        id,
        "userId",
        "stripePaymentMethodId",
        type,
        "isDefault",
        last4,
        brand,
        "expiryMonth",
        "expiryYear",
        metadata
      ) VALUES ($1, $2, $3, $4, COALESCE($5, false), $6, $7, $8, $9, $10)
      ON CONFLICT ("stripePaymentMethodId") DO UPDATE SET
        "userId" = EXCLUDED."userId",
        type = EXCLUDED.type,
        "isDefault" = EXCLUDED."isDefault",
        last4 = EXCLUDED.last4,
        brand = EXCLUDED.brand,
        "expiryMonth" = EXCLUDED."expiryMonth",
        "expiryYear" = EXCLUDED."expiryYear",
        metadata = EXCLUDED.metadata,
        "updatedAt" = NOW()
      RETURNING *`,
      [
        randomUUID(),
        data.userId,
        data.stripePaymentMethodId,
        data.type,
        data.isDefault ?? false,
        data.last4 ?? null,
        data.brand ?? null,
        data.expiryMonth ?? null,
        data.expiryYear ?? null,
        data.metadata ?? null,
      ],
    );

    return mapPaymentMethod(result.rows[0]);
  }

  async setDefault(
    userId: string,
    stripePaymentMethodId: string | null,
  ): Promise<void> {
    await this.database.transaction(async (client: PoolClient) => {
      await this.database.query(
        'UPDATE payment_methods SET "isDefault" = false, "updatedAt" = NOW() WHERE "userId" = $1',
        [userId],
        client,
      );

      if (stripePaymentMethodId) {
        await this.database.query(
          `UPDATE payment_methods
           SET "isDefault" = true, "updatedAt" = NOW()
           WHERE "userId" = $1 AND "stripePaymentMethodId" = $2`,
          [userId, stripePaymentMethodId],
          client,
        );
      }
    });
  }

  async deleteById(id: string): Promise<void> {
    await this.database.query('DELETE FROM payment_methods WHERE id = $1', [id]);
  }
}
