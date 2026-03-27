import { PaymentMethodsService } from './payment-methods.service';

describe('PaymentMethodsService', () => {
  const paymentMethodRepo = {
    find: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  };
  const userRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    save: jest.fn(),
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
    paymentMethodRepo as never,
    userRepo as never,
    stripeService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reuses an active setup intent instead of creating a new one', async () => {
    userRepo.findOne.mockResolvedValue({
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
    paymentMethodRepo.findOne.mockResolvedValueOnce({
      id: 'pm_db_1',
      userId: 'user_1',
      stripePaymentMethodId: 'pm_stripe_1',
    });
    userRepo.findOne.mockResolvedValue({
      id: 'user_1',
      stripeCustomerId: 'cus_123',
    });
    paymentMethodRepo.findOne.mockResolvedValueOnce({
      id: 'pm_db_1',
      userId: 'user_1',
      stripePaymentMethodId: 'pm_stripe_1',
      isDefault: true,
    });

    const result = await service.setDefault('user_1', 'pm_db_1');

    expect(paymentMethodRepo.update).toHaveBeenCalledWith(
      { userId: 'user_1' },
      { isDefault: false },
    );
    expect(paymentMethodRepo.update).toHaveBeenCalledWith(
      { userId: 'user_1', stripePaymentMethodId: 'pm_stripe_1' },
      { isDefault: true },
    );
    expect(userRepo.update).toHaveBeenCalledWith('user_1', {
      defaultPaymentMethodId: 'pm_stripe_1',
    });
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
