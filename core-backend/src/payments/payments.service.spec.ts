import { BadRequestException } from '@nestjs/common';
import { PaymentStatus } from '../shared';
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
  const usersSql = {
    findById: jest.fn(),
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
    usersSql as never,
    stripePaymentIntents as never,
    configService as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('creates a pending payment before client-side confirmation and returns Stripe status', async () => {
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
        country: 'GB',
        currency: 'gbp',
      });
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

      const result = await service.createPaymentIntent('user_1', {
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
      usersSql.findById.mockResolvedValue({
        id: 'user_1',
        stripeCustomerId: 'cus_123',
      });
      paymentMethodsSql.findByUserId.mockResolvedValue([
        {
          id: 'pm_db_2',
          userId: 'user_1',
          stripePaymentMethodId: 'pm_sepa_1',
          type: 'sepa_debit',
        },
      ]);

      await expect(
        service.createPaymentIntent('user_1', {
          amountGbp: 1250,
          paymentMethodId: 'pm_sepa_1',
        }),
      ).rejects.toThrow(BadRequestException);

      expect(stripePaymentIntents.createPaymentIntent).not.toHaveBeenCalled();
      expect(paymentsSql.create).not.toHaveBeenCalled();
    });
  });
});
