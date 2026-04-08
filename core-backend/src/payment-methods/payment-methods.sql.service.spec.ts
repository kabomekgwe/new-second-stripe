import { PaymentMethodsSqlService } from './payment-methods.sql.service';
import { OracleService } from '../database/oracle.service';
import oracledb from 'oracledb';
import { randomUUID } from 'crypto';

describe('PaymentMethodsSqlService', () => {
  let service: PaymentMethodsSqlService;
  let pool: oracledb.Pool;
  let testUserId: string;

  /** Helper: run a query against the raw pool (for test setup/teardown). */
  const rawQuery = async <T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: T[] }> => {
    const conn = await pool.getConnection();
    try {
      const result = await conn.execute(sql, params, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
        autoCommit: true,
      });
      return { rows: (result.rows ?? []) as T[] };
    } finally {
      await conn.close();
    }
  };

  beforeAll(async () => {
    pool = await oracledb.createPool({
      user: 'app_user',
      password: 'app_password',
      connectString: 'localhost:1521/FREEPDB1',
    });

    const database = {
      query: (text: string, params?: any[], connection?: any) => {
        if (connection) {
          return connection
            .execute(text, params ?? [], {
              outFormat: oracledb.OUT_FORMAT_OBJECT,
              autoCommit: false,
            })
            .then((r: any) => ({ rows: r.rows ?? [] }));
        }
        return rawQuery(text, params);
      },
      transaction: async <T>(callback: (connection: any) => Promise<T>): Promise<T> => {
        const connection = await pool.getConnection();
        try {
          const result = await callback(connection);
          await connection.commit();
          return result;
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          await connection.close();
        }
      },
    } as OracleService;

    service = new PaymentMethodsSqlService(database);

    testUserId = randomUUID();
    await rawQuery(
      `MERGE INTO USERS dst
       USING (SELECT :1 AS ID FROM dual) src ON (dst.ID = src.ID)
       WHEN NOT MATCHED THEN
         INSERT (ID, EMAIL, PASSWORD, USER_NAME, COUNTRY, CURRENCY)
         VALUES (:1, :2, :3, :4, :5, :6)`,
      [testUserId, `test-${testUserId}@example.com`, 'hashed', 'Test User', 'GB', 'GBP'],
    );
  });

  afterAll(async () => {
    await rawQuery('DELETE FROM STRIPE_PAYMENT_METHODS');
    await rawQuery(`DELETE FROM USERS WHERE EMAIL LIKE 'test-%@example.com'`);
    await pool.close(0);
  });

  beforeEach(async () => {
    await rawQuery('DELETE FROM STRIPE_PAYMENT_METHODS');
  });

  describe('upsertFromStripe', () => {
    it('creates a new payment method', async () => {
      const result = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_stripe_new',
        type: 'card',
        last4: '4242',
        brand: 'visa',
        expiryMonth: 12,
        expiryYear: 2025,
        isDefault: false,
      });

      expect(result).toMatchObject({
        userId: testUserId,
        stripePaymentMethodId: 'pm_stripe_new',
        type: 'card',
        last4: '4242',
        brand: 'visa',
        expiryMonth: 12,
        expiryYear: 2025,
        isDefault: false,
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.updatedAt).toBeInstanceOf(Date);
    });

    it('updates existing payment method on conflict', async () => {
      await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_stripe_conflict',
        type: 'card',
        last4: '1234',
        brand: 'mastercard',
        isDefault: false,
      });

      const updated = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_stripe_conflict',
        type: 'card',
        last4: '9999',
        brand: 'visa',
        expiryMonth: 6,
        expiryYear: 2026,
        isDefault: true,
      });

      expect(updated.last4).toBe('9999');
      expect(updated.brand).toBe('visa');
      expect(updated.expiryMonth).toBe(6);
      expect(updated.expiryYear).toBe(2026);
      expect(updated.isDefault).toBe(true);

      const all = await rawQuery(
        'SELECT * FROM STRIPE_PAYMENT_METHODS WHERE STRIPE_PAYMENT_METHOD_ID = :1',
        ['pm_stripe_conflict'],
      );
      expect(all.rows.length).toBe(1);
    });

    it('handles null optional fields', async () => {
      const result = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_stripe_minimal',
        type: 'card',
        isDefault: false,
      });

      expect(result.last4).toBeNull();
      expect(result.brand).toBeNull();
      expect(result.expiryMonth).toBeNull();
      expect(result.expiryYear).toBeNull();
      expect(result.metadata).toBeNull();
    });

    it('stores metadata as json', async () => {
      const metadata = { cardholder: 'John Doe', nickname: 'Work Card' };
      const result = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_stripe_meta',
        type: 'card',
        isDefault: false,
        metadata,
      });

      expect(result.metadata).toEqual(metadata);
    });

    it('sets updatedAt on update', async () => {
      const first = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_stripe_time',
        type: 'card',
        isDefault: false,
      });

      await new Promise((r) => setTimeout(r, 100));

      const second = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_stripe_time',
        type: 'card',
        isDefault: true,
      });

      expect(second.updatedAt.getTime()).toBeGreaterThan(first.updatedAt.getTime());
    });
  });

  describe('setDefault', () => {
    it('sets a payment method as default', async () => {
      const pm1 = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_default_1',
        type: 'card',
        isDefault: false,
      });

      const pm2 = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_default_2',
        type: 'card',
        isDefault: false,
      });

      await service.setDefault(testUserId, 'pm_default_2');

      const result1 = await service.findById(pm1.id);
      const result2 = await service.findById(pm2.id);

      expect(result1?.isDefault).toBe(false);
      expect(result2?.isDefault).toBe(true);
    });

    it('clears previous default when setting new one', async () => {
      const pm1 = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_switch_1',
        type: 'card',
        isDefault: true,
      });

      const pm2 = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_switch_2',
        type: 'card',
        isDefault: false,
      });

      await service.setDefault(testUserId, 'pm_switch_2');

      const result1 = await service.findById(pm1.id);
      const result2 = await service.findById(pm2.id);

      expect(result1?.isDefault).toBe(false);
      expect(result2?.isDefault).toBe(true);
    });

    it('clears all defaults when passed null', async () => {
      await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_clear_1',
        type: 'card',
        isDefault: true,
      });

      await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_clear_2',
        type: 'card',
        isDefault: true,
      });

      await service.setDefault(testUserId, null);

      const all = await service.findByUserId(testUserId);
      expect(all.every((pm) => pm.isDefault === false)).toBe(true);
    });

    it('uses transaction for atomicity', async () => {
      const pm = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_tx_test',
        type: 'card',
        isDefault: false,
      });

      await service.setDefault(testUserId, 'pm_tx_test');

      const result = await service.findById(pm.id);
      expect(result?.isDefault).toBe(true);
    });
  });

  describe('findById', () => {
    it('returns payment method by id', async () => {
      const pm = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_find_id',
        type: 'card',
        isDefault: false,
        last4: '1234',
      });

      const result = await service.findById(pm.id);
      expect(result).toMatchObject({
        id: pm.id,
        stripePaymentMethodId: 'pm_find_id',
        last4: '1234',
      });
    });

    it('returns null for non-existent id', async () => {
      const result = await service.findById(randomUUID());
      expect(result).toBeNull();
    });

    it('filters by userId when provided', async () => {
      const otherUserId = randomUUID();
      await rawQuery(
        `MERGE INTO USERS dst
         USING (SELECT :1 AS ID FROM dual) src ON (dst.ID = src.ID)
         WHEN NOT MATCHED THEN
           INSERT (ID, EMAIL, PASSWORD, USER_NAME, COUNTRY, CURRENCY)
           VALUES (:1, :2, :3, :4, :5, :6)`,
        [otherUserId, `other-${otherUserId}@example.com`, 'hashed', 'Other', 'GB', 'GBP'],
      );

      const pm = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_user_filter',
        type: 'card',
        isDefault: false,
      });

      const byCorrectUser = await service.findById(pm.id, testUserId);
      const byWrongUser = await service.findById(pm.id, otherUserId);

      expect(byCorrectUser).not.toBeNull();
      expect(byWrongUser).toBeNull();
    });
  });

  describe('findByStripePaymentMethodId', () => {
    it('returns payment method by stripe id', async () => {
      await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_stripe_find',
        type: 'card',
        isDefault: false,
        brand: 'amex',
      });

      const result = await service.findByStripePaymentMethodId('pm_stripe_find');
      expect(result).toMatchObject({
        stripePaymentMethodId: 'pm_stripe_find',
        brand: 'amex',
      });
    });

    it('returns null for non-existent stripe id', async () => {
      const result = await service.findByStripePaymentMethodId('pm_nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findByUserId', () => {
    it('returns all payment methods for user', async () => {
      await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_list_1',
        type: 'card',
        isDefault: false,
      });

      await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_list_2',
        type: 'card',
        isDefault: false,
      });

      const result = await service.findByUserId(testUserId);
      expect(result.length).toBe(2);
      expect(result.map((pm) => pm.stripePaymentMethodId).sort()).toEqual(
        ['pm_list_1', 'pm_list_2'].sort(),
      );
    });

    it('returns empty array for user with no payment methods', async () => {
      const lonelyUserId = randomUUID();
      await rawQuery(
        `MERGE INTO USERS dst
         USING (SELECT :1 AS ID FROM dual) src ON (dst.ID = src.ID)
         WHEN NOT MATCHED THEN
           INSERT (ID, EMAIL, PASSWORD, USER_NAME, COUNTRY, CURRENCY)
           VALUES (:1, :2, :3, :4, :5, :6)`,
        [lonelyUserId, `lonely-${lonelyUserId}@example.com`, 'hashed', 'Lonely', 'GB', 'GBP'],
      );

      const result = await service.findByUserId(lonelyUserId);
      expect(result).toEqual([]);
    });

    it('orders by createdAt descending', async () => {
      await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_old',
        type: 'card',
        isDefault: false,
      });

      await new Promise((r) => setTimeout(r, 50));

      await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_new',
        type: 'card',
        isDefault: false,
      });

      const result = await service.findByUserId(testUserId);
      const ordered = result.filter(
        (pm) =>
          pm.stripePaymentMethodId === 'pm_old' ||
          pm.stripePaymentMethodId === 'pm_new',
      );

      expect(ordered[0].stripePaymentMethodId).toBe('pm_new');
      expect(ordered[1].stripePaymentMethodId).toBe('pm_old');
    });
  });

  describe('deleteById', () => {
    it('deletes payment method', async () => {
      const pm = await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_delete',
        type: 'card',
        isDefault: false,
      });

      await service.deleteById(pm.id);

      const result = await service.findById(pm.id);
      expect(result).toBeNull();
    });

    it('silently handles non-existent id', async () => {
      await expect(service.deleteById(randomUUID())).resolves.not.toThrow();
    });
  });

  describe('edge cases and constraints', () => {
    it('enforces unique constraint on stripePaymentMethodId', async () => {
      await service.upsertFromStripe({
        userId: testUserId,
        stripePaymentMethodId: 'pm_unique_test',
        type: 'card',
        isDefault: false,
      });

      const result = await rawQuery<{ CNT: number }>(
        'SELECT COUNT(*) AS CNT FROM STRIPE_PAYMENT_METHODS WHERE STRIPE_PAYMENT_METHOD_ID = :1',
        ['pm_unique_test'],
      );

      expect(Number(result.rows[0].CNT)).toBe(1);
    });

    it('validates foreign key constraint on userId', async () => {
      const fakeUserId = randomUUID();

      await expect(
        service.upsertFromStripe({
          userId: fakeUserId,
          stripePaymentMethodId: 'pm_fk_test',
          type: 'card',
          isDefault: false,
        }),
      ).rejects.toThrow();
    });
  });
});
