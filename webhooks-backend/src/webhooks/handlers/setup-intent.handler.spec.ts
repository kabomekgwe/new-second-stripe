import type Stripe from 'stripe';
import { SetupIntentHandler } from './setup-intent.handler';

describe('SetupIntentHandler', () => {
  const database = {
    query: jest.fn(),
    transaction: jest.fn(),
  };

  const stripeService = {
    getClient: jest.fn(),
  };

  const handler = new SetupIntentHandler(
    database as never,
    stripeService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function buildSetupIntentEvent(
    setupIntent: Partial<Stripe.SetupIntent>,
  ): Stripe.Event {
    return {
      id: 'evt_si_test',
      type: 'setup_intent.succeeded',
      data: {
        object: {
          id: 'si_test',
          customer: 'cus_test',
          payment_method: 'pm_test',
          status: 'succeeded',
          ...setupIntent,
        } as Stripe.SetupIntent,
      },
    } as Stripe.Event;
  }

  function mockStripePaymentMethod(
    pm: Partial<Stripe.PaymentMethod>,
  ): Stripe.PaymentMethod {
    return {
      id: 'pm_test',
      object: 'payment_method',
      type: 'card',
      customer: 'cus_test',
      card: {
        last4: '4242',
        brand: 'visa',
        exp_month: 12,
        exp_year: 2025,
        checks: { address_line1_check: null, address_postal_code_check: null, cvc_check: null },
        country: 'US',
        fingerprint: 'fp_test',
        funding: 'credit',
        generated_from: null,
        networks: { available: ['visa'] },
        three_d_secure_usage: null,
        wallet: null,
      },
      billing_details: {
        address: { city: null, country: null, line1: null, line2: null, postal_code: null, state: null },
        email: null,
        name: null,
        phone: null,
      },
      metadata: {},
      created: Date.now(),
      ...pm,
    } as Stripe.PaymentMethod;
  }

  describe('handleSucceeded', () => {
    it('syncs payment method from Stripe API', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: null }],
      });
      stripeService.getClient.mockReturnValue({
        paymentMethods: {
          retrieve: jest.fn().mockResolvedValue(mockStripePaymentMethod({ id: 'pm_synced' })),
        },
      });
      database.query.mockResolvedValueOnce({ rows: [] });
      database.transaction.mockImplementation(async (cb: Function) => {
        await cb({});
      });

      await handler.handleSucceeded(
        buildSetupIntentEvent({
          id: 'si_123',
          customer: 'cus_test',
          payment_method: 'pm_synced',
        }),
      );

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('MERGE INTO "payment_methods"'),
        expect.arrayContaining(['user_1', 'pm_synced', 'card', '4242', 'visa']),
      );
    });

    it('warns when customer ID is missing', async () => {
      const consoleSpy = jest.spyOn(handler['logger'], 'warn');

      await handler.handleSucceeded(
        buildSetupIntentEvent({ customer: null }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('missing customer or payment_method'),
      );
      expect(database.query).not.toHaveBeenCalled();
    });

    it('warns when user not found', async () => {
      const consoleSpy = jest.spyOn(handler['logger'], 'warn');
      database.query.mockResolvedValueOnce({ rows: [] });

      await handler.handleSucceeded(
        buildSetupIntentEvent({ customer: 'cus_nonexistent' }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No user found'),
      );
    });

    it('sets default PM when user has none', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: null }],
      });
      stripeService.getClient.mockReturnValue({
        paymentMethods: {
          retrieve: jest.fn().mockResolvedValue(mockStripePaymentMethod({ id: 'pm_default' })),
        },
      });
      database.query.mockResolvedValueOnce({ rows: [] });
      database.transaction.mockImplementation(async (cb: Function) => {
        await cb({});
      });

      await handler.handleSucceeded(
        buildSetupIntentEvent({ payment_method: 'pm_default' }),
      );

      expect(database.transaction).toHaveBeenCalled();
      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('"isDefault" = :3'),
        expect.any(Array),
        expect.any(Object),
      );
    });

    it('does not set default when user already has one', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: 'pm_existing' }],
      });
      stripeService.getClient.mockReturnValue({
        paymentMethods: {
          retrieve: jest.fn().mockResolvedValue(mockStripePaymentMethod({ id: 'pm_new' })),
        },
      });
      database.query.mockResolvedValueOnce({ rows: [] });

      await handler.handleSucceeded(
        buildSetupIntentEvent({ payment_method: 'pm_new' }),
      );

      expect(database.transaction).not.toHaveBeenCalled();
    });

    it('handles Stripe API errors gracefully', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: null }],
      });
      stripeService.getClient.mockReturnValue({
        paymentMethods: {
          retrieve: jest.fn().mockRejectedValue(new Error('Stripe API error')),
        },
      });

      await expect(
        handler.handleSucceeded(buildSetupIntentEvent({ payment_method: 'pm_error' })),
      ).rejects.toThrow('Stripe API error');
    });

    it('handles non-card payment methods', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: null }],
      });
      const sepaPm = mockStripePaymentMethod({
        id: 'pm_sepa',
        type: 'sepa_debit',
        card: undefined,
        sepa_debit: {
          bank_code: '123',
          branch_code: '12345',
          country: 'DE',
          fingerprint: 'fp_sepa',
          last4: '1234',
          generated_from: null,
        },
      });
      stripeService.getClient.mockReturnValue({
        paymentMethods: {
          retrieve: jest.fn().mockResolvedValue(sepaPm),
        },
      });
      database.query.mockResolvedValueOnce({ rows: [] });
      database.transaction.mockImplementation(async (cb: Function) => {
        await cb({});
      });

      await handler.handleSucceeded(
        buildSetupIntentEvent({ payment_method: 'pm_sepa' }),
      );

      const insertCall = database.query.mock.calls.find((call) =>
        call[0].includes('MERGE INTO "payment_methods"'),
      );
      expect(insertCall[1]).toContain('sepa_debit');
    });

    it('logs success message after sync', async () => {
      const consoleSpy = jest.spyOn(handler['logger'], 'log');
      database.query.mockResolvedValueOnce({
        rows: [{ id: 'user_1', defaultPaymentMethodId: 'pm_existing' }],
      });
      stripeService.getClient.mockReturnValue({
        paymentMethods: {
          retrieve: jest.fn().mockResolvedValue(mockStripePaymentMethod({ id: 'pm_success' })),
        },
      });
      database.query.mockResolvedValueOnce({ rows: [] });

      await handler.handleSucceeded(
        buildSetupIntentEvent({ payment_method: 'pm_success' }),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Synced payment method pm_success'),
      );
    });
  });
});