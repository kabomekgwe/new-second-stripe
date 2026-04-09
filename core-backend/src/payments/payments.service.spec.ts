import { BadRequestException } from '@nestjs/common';
import { PaymentStatus } from '../shared';
import type { SafeUser } from '../shared';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  const paymentsSql = {
    create: jest.fn(),
    findByUserId: jest.fn(),
    findById: jest.fn(),
  };
  const paymentMethodsSql = {
    findByUserId: jest.fn(),
  };
  const stripePaymentIntents = {
    createFxQuote: jest.fn(),
    createPaymentIntent: jest.fn(),
    createCheckoutSession: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string, fallback?: string) => fallback),
  };

  const service = new PaymentsService(
    paymentsSql as never,
    paymentMethodsSql as never,
    stripePaymentIntents as never,
    configService as never,
  );

  const mockUser = (overrides = {}) =>
    ({
      id: 'user_1',
      email: 'test@example.com',
      name: 'Test User',
      stripeCustomerId: 'cus_123',
      defaultPaymentMethodId: null,
      country: 'GB',
      currency: 'gbp',
      monthlyManagementFee: null,
      accountValue: null,
      ...overrides,
    }) as SafeUser;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('creates a pending payment before client-side confirmation and returns Stripe status', async () => {
      paymentMethodsSql.findByUserId.mockResolvedValue([
        {
          id: 'pm_db_1',
          userId: 'user_1',
          stripePaymentMethodId: 'pm_card_1',
          type: 'card',
        },
      ]);
      stripePaymentIntents.createPaymentIntent.mockResolvedValue({
        id: 'pi_123',
        client_secret: 'pi_123_secret',
        status: 'requires_confirmation',
      });
      paymentsSql.create.mockResolvedValue({
        id: 'payment_1',
        status: PaymentStatus.PENDING,
      });

      const result = await service.createPaymentIntent(mockUser(), {
        amountGbp: 1250,
        paymentMethodId: 'pm_card_1',
        fxQuoteId: 'fxq_123',
      });

      expect(stripePaymentIntents.createPaymentIntent).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 1250,
          customer: 'cus_123',
          payment_method: 'pm_card_1',
          payment_method_types: ['card'],
          confirmation_method: 'automatic',
          metadata: expect.objectContaining({
            userId: 'user_1',
            type: 'user_payment',
            idempotencyKey: expect.any(String),
          }),
          fx_quote: 'fxq_123',
        }),
        expect.any(String),
      );
      expect(paymentsSql.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user_1',
          stripePaymentIntentId: 'pi_123',
          status: PaymentStatus.PENDING,
          paymentMethodId: 'pm_card_1',
        }),
      );
      expect(result).toEqual({
        clientSecret: 'pi_123_secret',
        paymentIntentId: 'pi_123',
        status: 'requires_confirmation',
        requiresAction: false,
      });
    });

    it('rejects unsupported saved payment methods', async () => {
      paymentMethodsSql.findByUserId.mockResolvedValue([
        {
          id: 'pm_db_2',
          userId: 'user_1',
          stripePaymentMethodId: 'pm_sepa_1',
          type: 'sepa_debit',
        },
      ]);

      await expect(
        service.createPaymentIntent(mockUser(), {
          amountGbp: 1250,
          paymentMethodId: 'pm_sepa_1',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(stripePaymentIntents.createPaymentIntent).not.toHaveBeenCalled();
      expect(paymentsSql.create).not.toHaveBeenCalled();
    });
  });
});
