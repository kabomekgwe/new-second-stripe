import type Stripe from 'stripe';
import { PaymentMethodHandler } from './payment-method.handler';

describe('PaymentMethodHandler', () => {
  const database = {
    query: jest.fn(),
    transaction: jest.fn(),
  };

  const handler = new PaymentMethodHandler(database as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildPaymentMethodEvent(
    pm: Partial<Stripe.PaymentMethod>,
  ): Stripe.Event {
    const card = {
      last4: '4242',
      brand: 'visa' as const,
      exp_month: 12,
      exp_year: 2025,
      checks: { address_line1_check: null, address_postal_code_check: null, cvc_check: null },
      country: 'US',
      fingerprint: 'fp_test',
      funding: 'credit' as const,
      generated_from: null,
      networks: { available: ['visa'], preferred: 'visa' },
      three_d_secure_usage: { supported: true },
      wallet: null,
    };
    return {
      id: 'evt_pm_test',
      type: 'payment_method.attached',
      data: {
        object: {
          id: 'pm_test',
          type: 'card',
          customer: 'cus_test',
          card,
          billing_details: { address: {}, email: null, name: null, phone: null, tax_id: null },
          ...pm,
        } as Stripe.PaymentMethod,
      },
    } as Stripe.Event;
  }

  describe('handleAttached', () => {
    it('creates payment method with complete card details', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: null }],
      });
      database.query.mockResolvedValueOnce({ rows: [] });
      database.transaction.mockImplementation(async (cb: Function) => {
        await cb({});
      });

      await handler.handleAttached(
        buildPaymentMethodEvent({
          id: 'pm_visa',
          customer: 'cus_test',
          card: {
            last4: '4242',
            brand: 'visa',
            exp_month: 12,
            exp_year: 2025,
          },
        }),
      );

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO payment_methods'),
        expect.arrayContaining(['user_1', 'pm_visa', 'card', '4242', 'visa']),
      );
    });

    it('stores metadata including billing details', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: null }],
      });
      database.query.mockResolvedValueOnce({ rows: [] });
      database.transaction.mockImplementation(async (cb: Function) => {
        await cb({});
      });

      const event = buildPaymentMethodEvent({
        id: 'pm_meta',
        billing_details: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        metadata: { source: 'checkout', orderId: '123' },
      });

      await handler.handleAttached(event);

      const insertCall = database.query.mock.calls.find((call) =>
        call[0].includes('INSERT INTO payment_methods'),
      );
      expect(insertCall).toBeDefined();
    });

    it('warns and returns early when customer ID is missing', async () => {
      const consoleSpy = jest.spyOn(handler['logger'], 'warn');

      await handler.handleAttached(
        buildPaymentMethodEvent({ customer: null }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('has no customer'),
      );
      expect(database.query).not.toHaveBeenCalled();
    });

    it('warns and returns early when user not found', async () => {
      const consoleSpy = jest.spyOn(handler['logger'], 'warn');
      database.query.mockResolvedValueOnce({ rows: [] });

      await handler.handleAttached(
        buildPaymentMethodEvent({ customer: 'cus_nonexistent' }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No user found'),
      );
      expect(database.query).toHaveBeenCalledTimes(1);
    });

    it('sets as default when user has no default PM', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: null }],
      });
      database.query.mockResolvedValueOnce({ rows: [] });
      database.transaction.mockImplementation(async (cb: Function) => {
        await cb({});
      });

      await handler.handleAttached(buildPaymentMethodEvent({ id: 'pm_first' }));

      expect(database.transaction).toHaveBeenCalled();
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE payment_methods SET "isDefault" = true'),
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('does not set default when user already has one', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: 'pm_existing' }],
      });
      database.query.mockResolvedValueOnce({ rows: [] });

      await handler.handleAttached(buildPaymentMethodEvent({ id: 'pm_second' }));

      expect(database.transaction).not.toHaveBeenCalled();
    });

    it('handles non-card payment methods gracefully', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: null }],
      });
      database.query.mockResolvedValueOnce({ rows: [] });
      database.transaction.mockImplementation(async (cb: Function) => {
        await cb({});
      });

      await handler.handleAttached(
        buildPaymentMethodEvent({
          id: 'pm_sepa',
          type: 'sepa_debit',
          card: null,
          sepa_debit: { last4: '1234', bank_code: '123' },
        }),
      );

      const insertCall = database.query.mock.calls.find((call) =>
        call[0].includes('INSERT INTO payment_methods'),
      );
      expect(insertCall[1]).toContain('sepa_debit');
    });
  });

  describe('handleDetached', () => {
    it('deletes payment method and clears default if needed', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'pm_1', userId: 'user_1' }],
      });
      database.query.mockResolvedValueOnce({ rows: [] });
      database.query.mockResolvedValueOnce({
        rows: [{ defaultPaymentMethodId: 'pm_detached' }],
      });
      database.query.mockResolvedValueOnce({ rows: [] });

      await handler.handleDetached({
        id: 'evt_detach',
        type: 'payment_method.detached',
        data: {
          object: { id: 'pm_detached' } as Stripe.PaymentMethod,
        },
      } as Stripe.Event);

      expect(database.query).toHaveBeenCalledWith(
        'DELETE FROM payment_methods WHERE id = $1',
        ['pm_1'],
      );
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET "defaultPaymentMethodId" = NULL'),
        ['user_1'],
      );
    });

    it('skips silently when PM not in database', async () => {
      database.query.mockResolvedValueOnce({ rows: [] });

      await handler.handleDetached({
        id: 'evt_detach',
        type: 'payment_method.detached',
        data: {
          object: { id: 'pm_unknown' } as Stripe.PaymentMethod,
        },
      } as Stripe.Event);

      expect(database.query).toHaveBeenCalledTimes(1);
    });

    it('does not clear default if different PM', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'pm_1', userId: 'user_1' }],
      });
      database.query.mockResolvedValueOnce({ rows: [] });
      database.query.mockResolvedValueOnce({
        rows: [{ defaultPaymentMethodId: 'pm_other' }],
      });

      await handler.handleDetached({
        id: 'evt_detach',
        type: 'payment_method.detached',
        data: {
          object: { id: 'pm_detached' } as Stripe.PaymentMethod,
        },
      } as Stripe.Event);

      expect(database.query).not.toHaveBeenCalledWith(
        expect.stringContaining('UPDATE users SET "defaultPaymentMethodId" = NULL'),
        expect.any(Array),
      );
    });
  });
});