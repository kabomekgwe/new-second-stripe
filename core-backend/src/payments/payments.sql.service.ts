import { Injectable } from '@nestjs/common';
import { Payment } from '@stripe-app/shared';
import { randomUUID } from 'crypto';
import { OracleService } from '../database/oracle.service';
import { mapPayment } from '../database/sql-mappers';

@Injectable()
export class PaymentsSqlService {
  constructor(private readonly database: OracleService) {}

  async create(
    data: Omit<Payment, 'id' | 'createdAt' | 'updatedAt' | 'user'>,
  ): Promise<Payment> {
    const newId = randomUUID();
    await this.database.query(
      `MERGE INTO "payments" t
       USING (SELECT :11 AS "idempotencyKey" FROM DUAL) s
       ON (t."idempotencyKey" = s."idempotencyKey")
       WHEN NOT MATCHED THEN INSERT (
         id,
         "userId",
         "stripePaymentIntentId",
         "stripeCheckoutSessionId",
         "amountGbp",
         "amountUserCurrency",
         "userCurrency",
         "fxQuoteId",
         status,
         "paymentMethodId",
         "idempotencyKey",
         metadata
       ) VALUES (:1,:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:12)`,
      [
        newId,
        data.userId,
        data.stripePaymentIntentId ?? null,
        data.stripeCheckoutSessionId ?? null,
        data.amountGbp,
        data.amountUserCurrency ?? null,
        data.userCurrency ?? null,
        data.fxQuoteId ?? null,
        data.status,
        data.paymentMethodId ?? null,
        data.idempotencyKey,
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );

    // Fetch the row (either newly inserted or existing from conflict)
    const result = await this.database.query(
      'SELECT * FROM payments WHERE "idempotencyKey" = :1 FETCH FIRST 1 ROWS ONLY',
      [data.idempotencyKey],
    );
    return mapPayment(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<Payment[]> {
    const result = await this.database.query(
      'SELECT * FROM payments WHERE "userId" = :1 ORDER BY "createdAt" DESC',
      [userId],
    );
    return result.rows.map(mapPayment);
  }

  async findById(id: string, userId: string): Promise<Payment | null> {
    const result = await this.database.query(
      'SELECT * FROM payments WHERE id = :1 AND "userId" = :2 FETCH FIRST 1 ROWS ONLY',
      [id, userId],
    );
    return result.rows[0] ? mapPayment(result.rows[0]) : null;
  }
}
