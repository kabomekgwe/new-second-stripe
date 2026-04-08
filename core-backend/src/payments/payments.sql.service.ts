import { Injectable } from '@nestjs/common';
import { Payment } from '../shared';
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
      `MERGE INTO STRIPE_PAYMENTS t
       USING (SELECT :1 AS IDEMPOTENCY_KEY FROM DUAL) s
       ON (t.IDEMPOTENCY_KEY = s.IDEMPOTENCY_KEY)
       WHEN NOT MATCHED THEN INSERT (
         ID,
         USER_ID,
         STRIPE_PAYMENT_INTENT_ID,
         STRIPE_CHECKOUT_SESSION_ID,
         AMOUNT_GBP,
         AMOUNT_USER_CURRENCY,
         USER_CURRENCY,
         FX_QUOTE_ID,
         STATUS,
         PAYMENT_METHOD_ID,
         IDEMPOTENCY_KEY,
         METADATA
       ) VALUES (:2,:3,:4,:5,:6,:7,:8,:9,:10,:11,:1,:12)`,
      [
        data.idempotencyKey,
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
        data.metadata ? JSON.stringify(data.metadata) : null,
      ],
    );

    // Fetch the row (either newly inserted or existing from conflict)
    const result = await this.database.query(
      'SELECT * FROM STRIPE_PAYMENTS WHERE IDEMPOTENCY_KEY = :1 FETCH FIRST 1 ROWS ONLY',
      [data.idempotencyKey],
    );
    return mapPayment(result.rows[0]);
  }

  async findByUserId(userId: string): Promise<Payment[]> {
    const result = await this.database.query(
      'SELECT * FROM STRIPE_PAYMENTS WHERE USER_ID = :1 ORDER BY CREATED_AT DESC',
      [userId],
    );
    return result.rows.map(mapPayment);
  }

  async findById(id: string, userId: string): Promise<Payment | null> {
    const result = await this.database.query(
      'SELECT * FROM STRIPE_PAYMENTS WHERE ID = :1 AND USER_ID = :2 FETCH FIRST 1 ROWS ONLY',
      [id, userId],
    );
    return result.rows[0] ? mapPayment(result.rows[0]) : null;
  }
}
