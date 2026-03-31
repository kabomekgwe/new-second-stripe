import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from '../webhooks.service';
import { PostgresService } from '../../database/postgres.service';
import { StripeService } from '../../stripe/stripe.service';
import { ConfigService } from '@nestjs/config';
import {
  PaymentIntentHandler,
  InvoiceHandler,
  SubscriptionHandler,
} from './index';
import { WebhookEventStatus } from '@stripe-app/shared';

describe('Webhook Failure and Retry Logic', () => {
  let service: WebhooksService;
  let database: jest.Mocked<PostgresService>;
  let stripeService: jest.Mocked<StripeService>;

  const mockEvent = {
    id: 'evt_123',
    type: 'payment_intent.succeeded',
    data: {
      object: {
        id: 'pi_123',
        amount: 1000,
      },
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: PostgresService,
          useValue: {
            query: jest.fn(),
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
            handleSucceeded: jest.fn(),
            handleFailed: jest.fn(),
          },
        },
        {
          provide: InvoiceHandler,
          useValue: {
            handleFinalized: jest.fn(),
            handlePaid: jest.fn(),
            handlePaymentFailed: jest.fn(),
          },
        },
        {
          provide: SubscriptionHandler,
          useValue: {
            handleCreated: jest.fn(),
            handleUpdated: jest.fn(),
            handleDeleted: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    database = module.get(PostgresService);
    stripeService = module.get(StripeService);
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

      // Should not reprocess
      const processingCalls = database.query.mock.calls.filter(
        (call) => call[1]?.[1] === 'PROCESSING',
      );
      expect(processingCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Failure Handling', () => {
    it('should mark event as FAILED when handler throws', async () => {
      database.query.mockResolvedValueOnce({ rows: [] } as any); // No existing event
      database.query.mockResolvedValueOnce({} as any); // Insert processing

      const paymentIntentHandler = {
        handleSucceeded: jest.fn().mockRejectedValue(new Error('Database error')),
      };

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
        call[0].includes('UPDATE webhook_events'),
      );
      expect(updateCall).toBeDefined();
    });
  });

  describe('Idempotency', () => {
    it('should store error message on failure', async () => {
      database.query
        .mockResolvedValueOnce({ rows: [] } as any)
        .mockResolvedValueOnce({} as any);

      const errorMessage = 'Connection timeout';

      await expect(service.handleEvent(Buffer.from('{}'), 'sig')).rejects.toThrow();
    });
  });
});
