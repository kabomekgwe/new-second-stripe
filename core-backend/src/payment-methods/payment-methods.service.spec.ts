import { PaymentMethodsService } from './payment-methods.service';

describe('PaymentMethodsService', () => {
  const paymentMethodsSql = {
    findById: jest.fn(),
    findByUserId: jest.fn(),
    upsertFromStripe: jest.fn(),
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
  };

  const service = new PaymentMethodsService(
    paymentMethodsSql as never,
    usersSql as never,
    stripeService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

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
    expect(stripeService.updateCustomerDefaultPaymentMethod).toHaveBeenCalledWith(
      'cus_123',
      'pm_stripe_1',
    );
    expect(result).toMatchObject({
      id: 'pm_db_1',
      stripePaymentMethodId: 'pm_stripe_1',
      isDefault: true,
    });
  });
});
