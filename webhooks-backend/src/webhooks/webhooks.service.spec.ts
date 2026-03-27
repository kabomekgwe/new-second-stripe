import {
  STRIPE_WEBHOOK_EVENTS,
  WebhookEventStatus,
} from '@stripe-app/shared';
import type Stripe from 'stripe';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  const webhookEventStore = new Map<
    string,
    { eventId: string; type: string; status: WebhookEventStatus }
  >();
  const webhookEventRepository = {
    findOne: jest.fn(
      async ({
        where,
      }: {
        where: { eventId: string };
      }) => webhookEventStore.get(where.eventId) ?? null,
    ),
    create: jest.fn((payload) => payload),
    save: jest.fn(async (payload) => {
      webhookEventStore.set(payload.eventId, payload);
      return payload;
    }),
    update: jest.fn(async (eventId: string, payload) => {
      const current = webhookEventStore.get(eventId) ?? {
        eventId,
        type: 'unknown',
        status: WebhookEventStatus.PROCESSING,
      };
      webhookEventStore.set(eventId, { ...current, ...payload });
      return undefined;
    }),
  };
  const stripeService = {
    constructWebhookEvent: jest.fn(),
  };

  const configService = {
    getOrThrow: jest.fn().mockReturnValue('whsec_test'),
    get: jest.fn().mockReturnValue('development'),
  };

  const setupIntentHandler = {
    handleSucceeded: jest.fn(),
  };

  const paymentMethodHandler = {
    handleAttached: jest.fn(),
    handleDetached: jest.fn(),
  };

  const paymentIntentHandler = {
    handleSucceeded: jest.fn(),
    handleFailed: jest.fn(),
  };

  const checkoutSessionHandler = {
    handleCompleted: jest.fn(),
    handleExpired: jest.fn(),
    handleAsyncSucceeded: jest.fn(),
    handleAsyncFailed: jest.fn(),
  };

  const service = new WebhooksService(
    webhookEventRepository as never,
    stripeService as never,
    configService as never,
    setupIntentHandler as never,
    paymentMethodHandler as never,
    paymentIntentHandler as never,
    checkoutSessionHandler as never,
  );

  beforeEach(() => {
    jest.clearAllMocks();
    webhookEventStore.clear();
  });

  function buildEvent(
    type: string,
    id: string,
    object: Record<string, unknown>,
  ): Stripe.Event {
    return {
      id,
      type,
      data: { object },
    } as unknown as Stripe.Event;
  }

  it('routes async checkout session success events to the checkout handler', async () => {
    const event = buildEvent(
      STRIPE_WEBHOOK_EVENTS.CHECKOUT_SESSION_ASYNC_PAYMENT_SUCCEEDED,
      'evt_async_success',
      { id: 'cs_async_success' },
    );
    stripeService.constructWebhookEvent.mockReturnValue(event);

    await service.handleEvent(Buffer.from('raw'), 'sig');

    expect(checkoutSessionHandler.handleAsyncSucceeded).toHaveBeenCalledWith(
      event,
    );
  });

  it('routes async checkout session failure events to the checkout handler', async () => {
    const event = buildEvent(
      STRIPE_WEBHOOK_EVENTS.CHECKOUT_SESSION_ASYNC_PAYMENT_FAILED,
      'evt_async_failed',
      { id: 'cs_async_failed' },
    );
    stripeService.constructWebhookEvent.mockReturnValue(event);

    await service.handleEvent(Buffer.from('raw'), 'sig');

    expect(checkoutSessionHandler.handleAsyncFailed).toHaveBeenCalledWith(
      event,
    );
  });

  it('skips duplicate webhook deliveries for the same event id', async () => {
    const event = buildEvent(
      STRIPE_WEBHOOK_EVENTS.PAYMENT_INTENT_SUCCEEDED,
      'evt_duplicate',
      {
        id: 'pi_duplicate',
        metadata: { type: 'management_fee' },
      },
    );
    stripeService.constructWebhookEvent.mockReturnValue(event);

    await service.handleEvent(Buffer.from('raw'), 'sig');
    await service.handleEvent(Buffer.from('raw'), 'sig');

    expect(paymentIntentHandler.handleSucceeded).toHaveBeenCalledTimes(1);
  });
});
