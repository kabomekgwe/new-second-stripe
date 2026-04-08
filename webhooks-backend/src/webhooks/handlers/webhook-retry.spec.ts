import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from '../webhooks.service';
import { OracleService } from '../../database/oracle.service';
import { StripeService } from '../../stripe/stripe.service';
import { ConfigService } from '@nestjs/config';
import { PaymentIntentHandler } from './payment-intent.handler';
import { InvoiceHandler } from './invoice.handler';
import { SubscriptionHandler } from './subscription.handler';
import { SetupIntentHandler } from './setup-intent.handler';
import { PaymentMethodHandler } from './payment-method.handler';
import { CheckoutSessionHandler } from './checkout-session.handler';
import { WebhookEventStatus } from '../../shared';

describe('Webhook Failure and Retry Logic', () => {
  let service: WebhooksService;
  let database: jest.Mocked<OracleService>;
  let paymentIntentHandler: jest.Mocked<PaymentIntentHandler>;

  const mockEvent = {
    id: 'evt_123',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_123',
        amount: 1000,
      },
    },
    object: {
      id: 'pi_123',
      amount: 1000,
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: OracleService,
          useValue: {
            query: jest.fn(),
            transaction: jest.fn(),
          },
        },
        {
          provide: StripeService,
          useValue: {
            constructWebhookEvent: jest.fn().mockReturnValue(mockEvent),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: jest.fn().mockReturnValue('whsec_test'),
            get: jest.fn().mockReturnValue('development'),
          },
        },
        {
          provide: PaymentIntentHandler,
          useValue: {
            handleSucceeded: jest.fn().mockResolvedValue(undefined),
            handleFailed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: InvoiceHandler,
          useValue: {
            handleFinalized: jest.fn().mockResolvedValue(undefined),
            handlePaid: jest.fn().mockResolvedValue(undefined),
            handlePaymentFailed: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SubscriptionHandler,
          useValue: {
            handleCreated: jest.fn().mockResolvedValue(undefined),
            handleUpdated: jest.fn().mockResolvedValue(undefined),
            handleDeleted: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: SetupIntentHandler,
          useValue: {
            handleSucceeded: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: PaymentMethodHandler,
          useValue: {
            handleAttached: jest.fn().mockResolvedValue(undefined),
            handleDetached: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: CheckoutSessionHandler,
          useValue: {
            handleCompleted: jest.fn().mockResolvedValue(undefined),
            handleAsyncSucceeded: jest.fn().mockResolvedValue(undefined),
            handleAsyncFailed: jest.fn().mockResolvedValue(undefined),
            handleExpired: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    database = module.get(OracleService);
    paymentIntentHandler = module.get(PaymentIntentHandler);
  });

  describe('Duplicate Event Handling', () => {
    it('should skip already processed events', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ eventId: 'evt_123', status: WebhookEventStatus.PROCESSED }],
      } as any);

      await service.handleEvent(Buffer.from('{}'), 'sig');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['evt_123'],
      );
    });

    it('should skip events currently being processed', async () => {
      database.query.mockResolvedValueOnce({
        rows: [{ eventId: 'evt_123', status: WebhookEventStatus.PROCESSING }],
      } as any);

      await service.handleEvent(Buffer.from('{}'), 'sig');

      expect(database.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['evt_123'],
      );
    });
  });

  describe('Failure Handling', () => {
    it('should mark event as FAILED when handler throws', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

      paymentIntentHandler.handleSucceeded.mockRejectedValueOnce(
        new Error('Database error'),
      );

      await expect(
        service.handleEvent(Buffer.from('{}'), 'sig'),
      ).rejects.toThrow('Database error');
    });

    it('should update status to PROCESSED on success', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

      await service.handleEvent(Buffer.from('{}'), 'sig');

      const updateCall = database.query.mock.calls.find((call) =>
        call[0].includes('UPDATE STRIPE_WEBHOOK_EVENTS'),
      )!;
      expect(updateCall).toBeDefined();
      expect(updateCall[1]).toContain(WebhookEventStatus.PROCESSED);
    });
  });

  describe('Idempotency', () => {
    it('should store error message on failure', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({} as any)
        .mockResolvedValueOnce({} as any);

      paymentIntentHandler.handleSucceeded.mockRejectedValueOnce(
        new Error('Connection timeout'),
      );

      await expect(
        service.handleEvent(Buffer.from('{}'), 'sig'),
      ).rejects.toThrow('Connection timeout');

      const failedUpdateCall = database.query.mock.calls.find(
        (call) =>
          typeof call[0] === 'string' &&
          call[0].includes('UPDATE') &&
          Array.isArray(call[1]) &&
          call[1][1] === WebhookEventStatus.FAILED,
      )!;
      expect(failedUpdateCall).toBeDefined();
      expect((failedUpdateCall[1] as any[])[2]).toBe('Connection timeout');
    });
  });
});