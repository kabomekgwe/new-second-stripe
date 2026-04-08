import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { createStripeClient } from './stripe-client.provider';
import * as customers from './stripe-customers';
import * as paymentIntents from './stripe-payment-intents';
import * as paymentMethods from './stripe-payment-methods';
import * as billing from './stripe-billing';
import * as webhooks from './stripe-webhooks';

@Injectable()
export class StripeService {
  private stripe: Stripe;
  private meterEventNameCache = { value: null as string | null };

  constructor(configService: ConfigService) {
    this.stripe = createStripeClient(configService);
  }

  // --- FX Quotes ---
  createFxQuote(
    params: {
      from_currency: string;
      to_currency: string;
      from_amount: number;
      lock_duration: string;
    },
    idempotencyKey: string,
  ) {
    return paymentIntents.createFxQuote(this.stripe, params, idempotencyKey);
  }

  // --- Customers ---
  createCustomer(params: Stripe.CustomerCreateParams, idempotencyKey: string) {
    return customers.createCustomer(this.stripe, params, idempotencyKey);
  }

  updateCustomerDefaultPaymentMethod(
    customerId: string,
    paymentMethodId: string | null,
  ) {
    return customers.updateCustomerDefaultPaymentMethod(
      this.stripe,
      customerId,
      paymentMethodId,
    );
  }

  // --- Setup Intents ---
  createSetupIntent(customerId: string, idempotencyKey: string) {
    return paymentMethods.createSetupIntent(
      this.stripe,
      customerId,
      idempotencyKey,
    );
  }

  listSetupIntents(customerId: string, limit = 10) {
    return paymentMethods.listSetupIntents(this.stripe, customerId, limit);
  }

  // --- Payment Intents ---
  createPaymentIntent(
    params: Omit<Stripe.PaymentIntentCreateParams, 'currency'>,
    idempotencyKey: string,
  ) {
    return paymentIntents.createPaymentIntent(
      this.stripe,
      params,
      idempotencyKey,
    );
  }

  // --- Checkout Sessions ---
  createCheckoutSession(
    params: Stripe.Checkout.SessionCreateParams,
    idempotencyKey: string,
  ) {
    return paymentIntents.createCheckoutSession(
      this.stripe,
      params,
      idempotencyKey,
    );
  }

  // --- Payment Methods ---
  listPaymentMethods(customerId: string) {
    return paymentMethods.listPaymentMethods(this.stripe, customerId);
  }

  retrievePaymentMethod(paymentMethodId: string) {
    return paymentMethods.retrievePaymentMethod(this.stripe, paymentMethodId);
  }

  detachPaymentMethod(paymentMethodId: string, idempotencyKey: string) {
    return paymentMethods.detachPaymentMethod(
      this.stripe,
      paymentMethodId,
      idempotencyKey,
    );
  }

  // --- Subscriptions ---
  listSubscriptions(customerId: string, limit = 10) {
    return billing.listSubscriptions(this.stripe, customerId, limit);
  }

  createBillingSubscription(params: {
    customerId: string;
    priceId: string;
    userId: string;
  }) {
    return billing.createBillingSubscription(this.stripe, params);
  }

  // --- Billing / Usage ---
  createMeterEvent(params: {
    eventName: string;
    customerId: string;
    value: number;
    identifier: string;
    timestamp: number;
  }) {
    return billing.createMeterEvent(this.stripe, params);
  }

  retrievePrice(priceId: string) {
    return billing.retrievePrice(this.stripe, priceId);
  }

  getBillingMeterEventName(priceId: string) {
    return billing.getBillingMeterEventName(
      this.stripe,
      priceId,
      this.meterEventNameCache,
    );
  }

  // --- Webhooks ---
  constructWebhookEvent(rawBody: Buffer, signature: string, secret: string) {
    return webhooks.constructWebhookEvent(
      this.stripe,
      rawBody,
      signature,
      secret,
    );
  }

  // --- Direct access (use sparingly) ---
  getClient(): Stripe {
    return this.stripe;
  }
}
