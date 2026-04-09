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
  const stripePaymentMethods = {
    listSetupIntents: jest.fn(),
    createSetupIntent: jest.fn(),
    cancelSetupIntent: jest.fn(),
    detachPaymentMethod: jest.fn(),
    retrievePaymentMethod: jest.fn(),
  };
  const stripeCustomers = {
    customerExists: jest.fn(),
    createCustomer: jest.fn(),
    updateDefaultPaymentMethod: jest.fn(),
  };

  const service = new PaymentMethodsService(
    paymentMethodsSql as never,
    usersSql as never,
    stripePaymentMethods as never,
    stripeCustomers as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    stripeCustomers.customerExists.mockResolvedValue(true);
  });

  describe('createSetupIntent', () => {
    it('reuses an active setup intent instead of creating a new one', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        country: 'GB',
      });
      stripePaymentMethods.listSetupIntents.mockResolvedValue({
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
      expect(stripePaymentMethods.createSetupIntent).not.toHaveBeenCalled();
    });

    it('recreates Stripe customer when stored stripeCustomerId no longer exists', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        stripeCustomerId: 'cus_missing',
        country: 'GB',
      });
      stripeCustomers.customerExists.mockResolvedValue(false);
      stripeCustomers.createCustomer.mockResolvedValue({ id: 'cus_new' });
      usersSql.updateStripeCustomerAndReturn.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_new',
        country: 'GB',
      });
      stripePaymentMethods.listSetupIntents.mockResolvedValue({ data: [] });
      stripePaymentMethods.createSetupIntent.mockResolvedValue({
        client_secret: 'new_secret',
      });

      const result = await service.createSetupIntent('user_1');

      expect(stripeCustomers.customerExists).toHaveBeenCalledWith('cus_missing');
      expect(stripeCustomers.createCustomer).toHaveBeenCalled();
      expect(usersSql.updateStripeCustomerAndReturn).toHaveBeenCalledWith(
        'user_1',
        'cus_new',
      );
      expect(result).toEqual({ clientSecret: 'new_secret' });
    });

    it('creates Stripe customer if user does not have one', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        name: 'Test User',
        stripeCustomerId: null,
        country: 'GB',
      });
      stripeCustomers.createCustomer.mockResolvedValue({ id: 'cus_new' });
      usersSql.updateStripeCustomerAndReturn.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_new',
        country: 'GB',
      });
      stripePaymentMethods.listSetupIntents.mockResolvedValue({ data: [] });
      stripePaymentMethods.createSetupIntent.mockResolvedValue({
        client_secret: 'new_secret',
      });

      const result = await service.createSetupIntent('user_1');

      expect(stripeCustomers.createCustomer).toHaveBeenCalledWith(
        {
          email: 'test@example.com',
          name: 'Test User',
          metadata: { userId: 'user_1' },
          address: { country: 'GB' },
        },
        expect.any(String),
      );
      expect(stripePaymentMethods.createSetupIntent).toHaveBeenCalledWith(
        'cus_new',
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

  describe('syncAndSavePaymentMethod', () => {
    it('sets as default when user has no default payment method', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        country: 'GB',
        defaultPaymentMethodId: null,
      });
      stripePaymentMethods.retrievePaymentMethod.mockResolvedValue({
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
      expect(stripeCustomers.updateDefaultPaymentMethod).toHaveBeenCalledWith(
        'cus_123',
        'pm_stripe_1',
      );
      expect(result.stripePaymentMethodId).toBe('pm_stripe_1');
    });

    it('does not set as default when user already has default', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        country: 'GB',
        defaultPaymentMethodId: 'pm_existing',
      });
      stripePaymentMethods.retrievePaymentMethod.mockResolvedValue({
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
      expect(stripeCustomers.updateDefaultPaymentMethod).not.toHaveBeenCalled();
      expect(result.isDefault).toBe(false);
    });

    it('is idempotent - calling sync twice for same PM succeeds', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        country: 'GB',
        defaultPaymentMethodId: null,
      });
      stripePaymentMethods.retrievePaymentMethod.mockResolvedValue({
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

      await service.syncAndSavePaymentMethod('user_1', 'pm_stripe_1');

      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        country: 'GB',
        defaultPaymentMethodId: 'pm_stripe_1',
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

      expect(result.stripePaymentMethodId).toBe('pm_stripe_1');
    });

    it('creates Stripe customer if user does not have one', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        email: 'test@example.com',
        stripeCustomerId: null,
        defaultPaymentMethodId: null,
        country: 'GB',
      });
      stripeCustomers.createCustomer.mockResolvedValue({ id: 'cus_new' });
      usersSql.updateStripeCustomerAndReturn.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_new',
        country: 'GB',
        defaultPaymentMethodId: null,
      });
      stripePaymentMethods.retrievePaymentMethod.mockResolvedValue({
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

      expect(stripeCustomers.createCustomer).toHaveBeenCalledWith(
        expect.objectContaining({ address: { country: 'GB' } }),
        expect.any(String),
      );
      expect(result.stripePaymentMethodId).toBe('pm_stripe_1');
    });

    it('rejects payment methods attached to another Stripe customer', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        defaultPaymentMethodId: null,
      });
      stripePaymentMethods.retrievePaymentMethod.mockResolvedValue({
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
      stripePaymentMethods.retrievePaymentMethod.mockResolvedValue({
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
      expect(stripeCustomers.updateDefaultPaymentMethod).toHaveBeenCalledWith(
        'cus_123',
        'pm_stripe_1',
      );
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
      stripePaymentMethods.detachPaymentMethod.mockResolvedValue({
        id: 'pm_stripe_1',
      });

      await service.removePaymentMethod('user_1', 'pm_db_1');

      expect(stripePaymentMethods.detachPaymentMethod).toHaveBeenCalledWith(
        'pm_stripe_1',
        expect.any(String),
      );
      expect(paymentMethodsSql.setDefault).toHaveBeenCalledWith('user_1', null);
      expect(usersSql.updateDefaultPaymentMethod).toHaveBeenCalledWith(
        'user_1',
        null,
      );
      expect(stripeCustomers.updateDefaultPaymentMethod).toHaveBeenCalledWith(
        'cus_123',
        null,
      );
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
      stripePaymentMethods.detachPaymentMethod.mockResolvedValue({
        id: 'pm_stripe_1',
      });

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
