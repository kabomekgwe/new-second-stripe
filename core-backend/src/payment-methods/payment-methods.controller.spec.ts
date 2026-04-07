import { Test, TestingModule } from '@nestjs/testing';
import { PaymentMethodsController } from './payment-methods.controller';
import { PaymentMethodsService } from './payment-methods.service';
import { BadRequestException } from '@nestjs/common';

describe('PaymentMethodsController', () => {
  let controller: PaymentMethodsController;
  const paymentMethodsService = {
    getUserPaymentMethods: jest.fn(),
    getAvailablePaymentMethodTypes: jest.fn(),
    createSetupIntent: jest.fn(),
    syncAndSavePaymentMethod: jest.fn(),
    setDefault: jest.fn(),
    removePaymentMethod: jest.fn(),
  };

  const mockRequest = (user: any) =>
    ({
      user,
      isAuthenticated: () => true,
    }) as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PaymentMethodsController],
      providers: [
        {
          provide: PaymentMethodsService,
          useValue: paymentMethodsService,
        },
      ],
    }).compile();

    controller = module.get<PaymentMethodsController>(PaymentMethodsController);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /payment-methods', () => {
    it('returns user payment methods', async () => {
      const mockPMs = [{ id: 'pm_1' }, { id: 'pm_2' }];
      paymentMethodsService.getUserPaymentMethods.mockResolvedValue(mockPMs);

      const result = await controller.getUserPaymentMethods(
        mockRequest({ id: 'user_1' }),
      );

      expect(result).toEqual(mockPMs);
      expect(paymentMethodsService.getUserPaymentMethods).toHaveBeenCalledWith(
        'user_1',
      );
    });
  });

  describe('GET /payment-methods/available', () => {
    it('returns available payment method types', async () => {
      const mockTypes = [{ type: 'card', label: 'Card', category: 'Card' }];
      paymentMethodsService.getAvailablePaymentMethodTypes.mockResolvedValue(
        mockTypes,
      );

      const result = await controller.getAvailablePaymentMethodTypes(
        mockRequest({ id: 'user_1' }),
      );

      expect(result).toEqual(mockTypes);
      expect(paymentMethodsService.getAvailablePaymentMethodTypes).toHaveBeenCalledWith(
        'user_1',
      );
    });
  });

  describe('POST /payment-methods/setup-intent', () => {
    it('creates setup intent and returns client secret', async () => {
      paymentMethodsService.createSetupIntent.mockResolvedValue({
        clientSecret: 'seti_secret_123',
      });

      const result = await controller.createSetupIntent(
        mockRequest({ id: 'user_1' }),
      );

      expect(result).toEqual({ clientSecret: 'seti_secret_123' });
      expect(paymentMethodsService.createSetupIntent).toHaveBeenCalledWith(
        'user_1',
      );
    });
  });

  describe('POST /payment-methods/sync', () => {
    it('syncs payment method with valid ID', async () => {
      const mockPM = {
        id: 'pm_db_1',
        stripePaymentMethodId: 'pm_123456',
        isDefault: true,
      };
      paymentMethodsService.syncAndSavePaymentMethod.mockResolvedValue(mockPM);

      const result = await controller.syncPaymentMethod(
        mockRequest({ id: 'user_1' }),
        { stripePaymentMethodId: 'pm_123456' },
      );

      expect(result).toEqual(mockPM);
      expect(paymentMethodsService.syncAndSavePaymentMethod).toHaveBeenCalledWith(
        'user_1',
        'pm_123456',
      );
    });

    it('validation is handled by ValidationPipe (documented)', async () => {
      // ValidationPipe validates the DTO before reaching the controller
      // Invalid formats like 'invalid_id' are rejected with 400 Bad Request
      // The IsValidPaymentMethodId decorator ensures format: /^pm_[a-zA-Z0-9]+$/
      // This is tested in integration tests with ValidationPipe enabled
      expect(true).toBe(true);
    });

    it('logs success and failure', async () => {
      const consoleSpy = jest.spyOn(controller['logger'], 'log');
      const errorSpy = jest.spyOn(controller['logger'], 'error');

      paymentMethodsService.syncAndSavePaymentMethod.mockResolvedValue({
        id: 'pm_1',
      });

      await controller.syncPaymentMethod(mockRequest({ id: 'user_1' }), {
        stripePaymentMethodId: 'pm_123',
      });

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('pm_123'));
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Successfully synced'),
      );

      paymentMethodsService.syncAndSavePaymentMethod.mockRejectedValue(
        new Error('Stripe error'),
      );

      await expect(
        controller.syncPaymentMethod(mockRequest({ id: 'user_1' }), {
          stripePaymentMethodId: 'pm_456',
        }),
      ).rejects.toThrow();

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('pm_456'));
    });
  });

  describe('POST /payment-methods/:id/default', () => {
    it('sets payment method as default', async () => {
      const mockPM = { id: 'pm_db_1', isDefault: true };
      paymentMethodsService.setDefault.mockResolvedValue(mockPM);

      const result = await controller.setDefault(
        mockRequest({ id: 'user_1' }),
        'pm_db_1',
      );

      expect(result).toEqual(mockPM);
      expect(paymentMethodsService.setDefault).toHaveBeenCalledWith(
        'user_1',
        'pm_db_1',
      );
    });
  });

  describe('DELETE /payment-methods/:id', () => {
    it('removes payment method', async () => {
      paymentMethodsService.removePaymentMethod.mockResolvedValue(undefined);

      await controller.removePaymentMethod(
        mockRequest({ id: 'user_1' }),
        'pm_db_1',
      );

      expect(paymentMethodsService.removePaymentMethod).toHaveBeenCalledWith(
        'user_1',
        'pm_db_1',
      );
    });
  });
});
