import { PaymentMethodsService } from './payment-methods.service';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('PaymentMethodsService', () => {
  const paymentMethodsSql = {
    findById: jest.fn(),
    findByUserId: jest.fn(),
    findByStripePaymentMethodId: jest.fn(),
    upsertFromStripe: jest.fn(),
    upsertFromStripeTX: jest.fn(),
    setDefault: jest.fn(),
    deleteById: jest.fn(),
  };
  const usersSql = {
    findById: jest.fn(),
    updateDefaultPaymentMethod: jest.fn(),
    updateStripeCustomerAndReturn: jest.fn(),
  };
  const stripeService = {
    createCustomer: jest.fn(),
    listSetupIntents: jest.fn(),
    createSetupIntent: jest.fn(),
    updateCustomerDefaultPaymentMethod: jest.fn(),
    detachPaymentMethod: jest.fn(),
    getPaymentMethodConfigurations: jest.fn(),
    retrievePaymentMethod: jest.fn(),
  };

  const service = new PaymentMethodsService(
    paymentMethodsSql as never,
    usersSql as never,
    stripeService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSetupIntent', () => {
    it('reuses an active setup intent instead of creating a new one', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
      });
      stripeService.listSetupIntents.mockResolvedValue({
        data: [
          {
            id: 'seti_active',
            status: 'requires_payment_method',
            client_secret: 'seti_secret',
          },
        ],
      });

      const result = await service.createSetupIntent('user_1');

      expect(result).toEqual({ clientSecret: 'seti_secret' });
      expect(stripeService.createSetupIntent).not.toHaveBeenCalled();
    });

    it('creates Stripe customer if user does not have one', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        stripeCustomerId: null,
      });
      stripeService.createCustomer.mockResolvedValue({ id: 'cus_new' });
      usersSql.updateStripeCustomerAndReturn.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_new',
      });
      stripeService.listSetupIntents.mockResolvedValue({ data: [] });
      stripeService.createSetupIntent.mockResolvedValue({
        client_secret: 'new_secret',
      });

      const result = await service.createSetupIntent('user_1');

      expect(stripeService.createCustomer).toHaveBeenCalledWith(
        {
          email: 'test@example.com',
          name: 'Test User',
          metadata: { userId: 'user_1' },
        },
        expect.any(String),
      );
      expect(result).toEqual({ clientSecret: 'new_secret' });
    });

    it('throws NotFoundException when user does not exist', async () => {
      usersSql.findById.mockResolvedValue(null);

      await expect(service.createSetupIntent('nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getAvailablePaymentMethodTypes', () => {
    it('returns only supported saved payment method types', async () => {
      stripeService.getPaymentMethodConfigurations.mockResolvedValue({
        data: [
          {
            card: { available: true },
            sepa_debit: { available: true },
            ideal: { available: true },
          },
        ],
      });

      const result = await service.getAvailablePaymentMethodTypes();

      expect(result).toEqual([{ type: 'card', label: 'Card' }]);
    });
  });

  describe('syncAndSavePaymentMethod', () => {
    it('sets as default when user has no default payment method', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        defaultPaymentMethodId: null,
      });
      stripeService.retrievePaymentMethod.mockResolvedValue({
        id: 'pm_stripe_1',
        customer: 'cus_123',
        type: 'card',
        card: { last4: '4242', brand: 'visa', exp_month: 12, exp_year: 2025 },
        metadata: {},
      });
      paymentMethodsSql.upsertFromStripeTX.mockResolvedValue({
        id: 'pm_db_1',
        stripePaymentMethodId: 'pm_stripe_1',
        isDefault: true,
      });

      const result = await service.syncAndSavePaymentMethod(
        'user_1',
        'pm_stripe_1',
      );

      expect(paymentMethodsSql.upsertFromStripeTX).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_1',
          stripePaymentMethodId: 'pm_stripe_1',
        }),
        null,
      );
      expect(
        stripeService.updateCustomerDefaultPaymentMethod,
      ).toHaveBeenCalledWith('cus_123', 'pm_stripe_1');
      expect(result.stripePaymentMethodId).toBe('pm_stripe_1');
    });

    it('does not set as default when user already has default', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        defaultPaymentMethodId: 'pm_existing',
      });
      stripeService.retrievePaymentMethod.mockResolvedValue({
        id: 'pm_stripe_2',
        customer: 'cus_123',
        type: 'card',
        card: { last4: '1234', brand: 'mastercard', exp_month: 6, exp_year: 2026 },
        metadata: {},
      });
      paymentMethodsSql.upsertFromStripeTX.mockResolvedValue({
        id: 'pm_db_2',
        stripePaymentMethodId: 'pm_stripe_2',
        isDefault: false,
      });

      const result = await service.syncAndSavePaymentMethod(
        'user_1',
        'pm_stripe_2',
      );

      expect(paymentMethodsSql.upsertFromStripeTX).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_1',
          stripePaymentMethodId: 'pm_stripe_2',
        }),
        'pm_existing',
      );
      expect(stripeService.updateCustomerDefaultPaymentMethod).not.toHaveBeenCalled();
      expect(result.isDefault).toBe(false);
    });

    it('is idempotent - calling sync twice for same PM succeeds', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        defaultPaymentMethodId: null,
      });
      stripeService.retrievePaymentMethod.mockResolvedValue({
        id: 'pm_stripe_1',
        customer: 'cus_123',
        type: 'card',
        card: { last4: '4242', brand: 'visa', exp_month: 12, exp_year: 2025 },
        metadata: {},
      });
      paymentMethodsSql.upsertFromStripeTX.mockResolvedValue({
        id: 'pm_db_1',
        stripePaymentMethodId: 'pm_stripe_1',
        isDefault: true,
      });

      // First call
      await service.syncAndSavePaymentMethod('user_1', 'pm_stripe_1');

      // Reset for second call - user now has default
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        defaultPaymentMethodId: 'pm_stripe_1',
      });
      paymentMethodsSql.upsertFromStripeTX.mockResolvedValue({
        id: 'pm_db_1',
        stripePaymentMethodId: 'pm_stripe_1',
        isDefault: true,
      });

      // Second call should succeed without error
      const result = await service.syncAndSavePaymentMethod(
        'user_1',
        'pm_stripe_1',
      );

      expect(result.stripePaymentMethodId).toBe('pm_stripe_1');
    });

    it('creates Stripe customer if user does not have one', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        stripeCustomerId: null,
        defaultPaymentMethodId: null,
      });
      stripeService.createCustomer.mockResolvedValue({ id: 'cus_new' });
      usersSql.updateStripeCustomerAndReturn.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_new',
        defaultPaymentMethodId: null,
      });
      stripeService.retrievePaymentMethod.mockResolvedValue({
        id: 'pm_stripe_1',
        customer: 'cus_new',
        type: 'card',
        card: { last4: '4242', brand: 'visa', exp_month: 12, exp_year: 2025 },
        metadata: {},
      });
      paymentMethodsSql.upsertFromStripeTX.mockResolvedValue({
        id: 'pm_db_1',
        stripePaymentMethodId: 'pm_stripe_1',
        isDefault: true,
      });

      const result = await service.syncAndSavePaymentMethod(
        'user_1',
        'pm_stripe_1',
      );

      expect(stripeService.createCustomer).toHaveBeenCalled();
      expect(result.stripePaymentMethodId).toBe('pm_stripe_1');
    });

    it('rejects payment methods attached to another Stripe customer', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        defaultPaymentMethodId: null,
      });
      stripeService.retrievePaymentMethod.mockResolvedValue({
        id: 'pm_foreign',
        customer: 'cus_other',
        type: 'card',
        card: { last4: '4242', brand: 'visa', exp_month: 12, exp_year: 2025 },
        metadata: {},
      });

      await expect(
        service.syncAndSavePaymentMethod('user_1', 'pm_foreign'),
      ).rejects.toThrow(BadRequestException);

      expect(paymentMethodsSql.upsertFromStripeTX).not.toHaveBeenCalled();
    });

    it('rejects unattached payment methods', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        defaultPaymentMethodId: null,
      });
      stripeService.retrievePaymentMethod.mockResolvedValue({
        id: 'pm_unattached',
        customer: null,
        type: 'card',
        card: { last4: '4242', brand: 'visa', exp_month: 12, exp_year: 2025 },
        metadata: {},
      });

      await expect(
        service.syncAndSavePaymentMethod('user_1', 'pm_unattached'),
      ).rejects.toThrow(BadRequestException);

      expect(paymentMethodsSql.upsertFromStripeTX).not.toHaveBeenCalled();
    });
  });

  describe('setDefault', () => {
    it('updates local and Stripe defaults when setting a payment method', async () => {
      paymentMethodsSql.findById.mockResolvedValueOnce({
        id: 'pm_db_1',
        userId: 'user_1',
        stripePaymentMethodId: 'pm_stripe_1',
      });
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
      });
      paymentMethodsSql.findById.mockResolvedValueOnce({
        id: 'pm_db_1',
        userId: 'user_1',
        stripePaymentMethodId: 'pm_stripe_1',
        isDefault: true,
      });

      const result = await service.setDefault('user_1', 'pm_db_1');

      expect(paymentMethodsSql.setDefault).toHaveBeenCalledWith(
        'user_1',
        'pm_stripe_1',
      );
      expect(usersSql.updateDefaultPaymentMethod).toHaveBeenCalledWith(
        'user_1',
        'pm_stripe_1',
      );
      expect(
        stripeService.updateCustomerDefaultPaymentMethod,
      ).toHaveBeenCalledWith('cus_123', 'pm_stripe_1');
      expect(result).toMatchObject({
        id: 'pm_db_1',
        stripePaymentMethodId: 'pm_stripe_1',
        isDefault: true,
      });
    });

    it('throws NotFoundException when payment method does not exist', async () => {
      paymentMethodsSql.findById.mockResolvedValue(null);

      await expect(service.setDefault('user_1', 'nonexistent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when payment method belongs to different user', async () => {
      // findById with userId filter returns null when userId doesn't match
      paymentMethodsSql.findById.mockResolvedValue(null);

      await expect(service.setDefault('user_1', 'pm_db_1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('removePaymentMethod', () => {
    it('removes payment method and clears default if it was default', async () => {
      paymentMethodsSql.findById.mockResolvedValue({
        id: 'pm_db_1',
        userId: 'user_1',
        stripePaymentMethodId: 'pm_stripe_1',
        isDefault: true,
      });
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
      });
      stripeService.detachPaymentMethod.mockResolvedValue({ id: 'pm_stripe_1' });

      await service.removePaymentMethod('user_1', 'pm_db_1');

      expect(stripeService.detachPaymentMethod).toHaveBeenCalledWith(
        'pm_stripe_1',
        expect.any(String),
      );
      expect(paymentMethodsSql.setDefault).toHaveBeenCalledWith('user_1', null);
      expect(usersSql.updateDefaultPaymentMethod).toHaveBeenCalledWith(
        'user_1',
        null,
      );
      expect(
        stripeService.updateCustomerDefaultPaymentMethod,
      ).toHaveBeenCalledWith('cus_123', null);
      expect(paymentMethodsSql.deleteById).toHaveBeenCalledWith('pm_db_1');
    });

    it('removes payment method without clearing default if not default', async () => {
      paymentMethodsSql.findById.mockResolvedValue({
        id: 'pm_db_1',
        userId: 'user_1',
        stripePaymentMethodId: 'pm_stripe_1',
        isDefault: false,
      });
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
      });
      stripeService.detachPaymentMethod.mockResolvedValue({ id: 'pm_stripe_1' });

      await service.removePaymentMethod('user_1', 'pm_db_1');

      expect(paymentMethodsSql.setDefault).not.toHaveBeenCalled();
      expect(usersSql.updateDefaultPaymentMethod).not.toHaveBeenCalled();
      expect(paymentMethodsSql.deleteById).toHaveBeenCalledWith('pm_db_1');
    });

    it('throws NotFoundException when payment method does not exist', async () => {
      paymentMethodsSql.findById.mockResolvedValue(null);

      await expect(
        service.removePaymentMethod('user_1', 'nonexistent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getUserPaymentMethods', () => {
    it('returns payment methods for user', async () => {
      paymentMethodsSql.findByUserId.mockResolvedValue([
        { id: 'pm_db_1', stripePaymentMethodId: 'pm_stripe_1' },
        { id: 'pm_db_2', stripePaymentMethodId: 'pm_stripe_2' },
      ]);

      const result = await service.getUserPaymentMethods('user_1');

      expect(paymentMethodsSql.findByUserId).toHaveBeenCalledWith('user_1');
      expect(result).toHaveLength(2);
    });
  });
});
