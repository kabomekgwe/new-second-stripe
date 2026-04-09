import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Payment,
  User,
  PaymentStatus,
  FxQuoteResponse,
  CreatePaymentResponse,
  CreateCheckoutSessionResponse,
  PaymentMethod,
  SUPPORTED_SAVED_PAYMENT_METHOD_TYPES,
} from '../shared';
import { StripePaymentIntentsService } from '../stripe/stripe-payment-intents.service';
import { generateUniqueIdempotencyKey } from '../common/utils/idempotency';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { PaymentMethodsSqlService } from '../payment-methods/payment-methods.sql.service';
import { UsersSqlService } from '../users/users.sql.service';
import { PaymentsSqlService } from './payments.sql.service';

@Injectable()
export class PaymentsService {
  private readonly frontendUrl: string;
  private static readonly SUPPORTED_PAYMENT_METHOD_TYPE_SET = new Set(
    SUPPORTED_SAVED_PAYMENT_METHOD_TYPES,
  );

  constructor(
    private readonly paymentsSql: PaymentsSqlService,
    private readonly paymentMethodsSql: PaymentMethodsSqlService,
    private readonly usersSql: UsersSqlService,
    private readonly stripePaymentIntents: StripePaymentIntentsService,
    private readonly configService: ConfigService,
  ) {
    this.frontendUrl = this.configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:3000',
    );
  }

  async getFxQuote(
    userId: string,
    amountGbp: number,
  ): Promise<FxQuoteResponse> {
    const user = await this.findUserOrFail(userId);

    if (user.currency.toLowerCase() === 'gbp') {
      return {
        fromAmount: amountGbp,
        fromCurrency: 'gbp',
        toAmount: amountGbp,
        toCurrency: 'gbp',
        quoteId: '',
        expiresAt: '',
      };
    }

    const idempotencyKey = generateUniqueIdempotencyKey(
      'fx_quote',
      userId,
      String(amountGbp),
      user.currency,
    );

    const quote = await this.stripePaymentIntents.createFxQuote(
      {
        from_currency: 'gbp',
        to_currency: user.currency.toLowerCase(),
        from_amount: amountGbp,
        lock_duration: 'hour',
      },
      idempotencyKey,
    );

    return {
      fromAmount: quote.from_amount,
      fromCurrency: quote.from_currencies?.[0] ?? 'gbp',
      toAmount: quote.to_amount,
      toCurrency: quote.to_currency,
      quoteId: quote.id,
      expiresAt: quote.expires_at ?? '',
    };
  }

  async createPaymentIntent(
    userId: string,
    dto: CreatePaymentDto,
  ): Promise<CreatePaymentResponse> {
    const user = await this.findUserOrFail(userId);
    const paymentMethod = await this.findSupportedPaymentMethodOrFail(
      userId,
      dto.paymentMethodId,
    );

    if (!user.stripeCustomerId) {
      throw new BadRequestException(
        'User does not have a Stripe customer account',
      );
    }

    const idempotencyKey = generateUniqueIdempotencyKey(
      'payment',
      userId,
      String(dto.amountGbp),
      dto.paymentMethodId,
    );

    const paymentIntent = await this.stripePaymentIntents.createPaymentIntent(
      {
        amount: dto.amountGbp,
        customer: user.stripeCustomerId,
        payment_method: paymentMethod.stripePaymentMethodId,
        payment_method_types: [...SUPPORTED_SAVED_PAYMENT_METHOD_TYPES],
        confirmation_method: 'automatic',
        metadata: {
          userId,
          type: 'user_payment',
          idempotencyKey,
        },
        ...(dto.fxQuoteId ? { fx_quote: dto.fxQuoteId } : {}),
      } as never,
      idempotencyKey,
    );

    await this.paymentsSql.create({
      userId,
      stripePaymentIntentId: paymentIntent.id,
      stripeCheckoutSessionId: null,
      amountGbp: dto.amountGbp,
      amountUserCurrency: null,
      userCurrency: null,
      fxQuoteId: dto.fxQuoteId ?? null,
      status: PaymentStatus.PENDING,
      paymentMethodId: paymentMethod.stripePaymentMethodId,
      idempotencyKey,
      metadata: null,
    });

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      requiresAction: paymentIntent.status === 'requires_action',
    };
  }

  async createCheckoutSession(
    userId: string,
    dto: CreateCheckoutSessionDto,
  ): Promise<CreateCheckoutSessionResponse> {
    const user = await this.findUserOrFail(userId);

    if (!user.stripeCustomerId) {
      throw new BadRequestException(
        'User does not have a Stripe customer account',
      );
    }

    const idempotencyKey = generateUniqueIdempotencyKey(
      'checkout',
      userId,
      String(dto.amountGbp),
    );

    const session = await this.stripePaymentIntents.createCheckoutSession(
      {
        mode: 'payment',
        ui_mode: 'embedded',
        customer: user.stripeCustomerId,
        line_items: [
          {
            price_data: {
              currency: 'gbp',
              unit_amount: dto.amountGbp,
              product_data: {
                name: 'Payment',
              },
            },
            quantity: 1,
          },
        ],
        adaptive_pricing: { enabled: true },
        return_url: `${this.frontendUrl}/payments?session_id={CHECKOUT_SESSION_ID}`,
        metadata: { userId, type: 'user_payment' },
      },
      idempotencyKey,
    );

    await this.paymentsSql.create({
      userId,
      stripePaymentIntentId: null,
      stripeCheckoutSessionId: session.id,
      amountGbp: dto.amountGbp,
      amountUserCurrency: null,
      userCurrency: null,
      fxQuoteId: null,
      status: PaymentStatus.PENDING,
      paymentMethodId: null,
      idempotencyKey,
      metadata: null,
    });

    return {
      clientSecret: session.client_secret!,
      sessionId: session.id,
    };
  }

  async getPayments(userId: string): Promise<Payment[]> {
    return this.paymentsSql.findByUserId(userId);
  }

  async getPaymentById(userId: string, paymentId: string): Promise<Payment> {
    const payment = await this.paymentsSql.findById(paymentId, userId);
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.usersSql.findById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  private async findSupportedPaymentMethodOrFail(
    userId: string,
    stripePaymentMethodId: string,
  ): Promise<PaymentMethod> {
    const paymentMethods = await this.paymentMethodsSql.findByUserId(userId);
    const paymentMethod =
      paymentMethods.find(
        (entry) => entry.stripePaymentMethodId === stripePaymentMethodId,
      ) ?? null;

    if (!paymentMethod) {
      throw new BadRequestException(
        'Selected payment method is not saved for this user',
      );
    }

    if (
      !PaymentsService.SUPPORTED_PAYMENT_METHOD_TYPE_SET.has(
        paymentMethod.type as (typeof SUPPORTED_SAVED_PAYMENT_METHOD_TYPES)[number],
      )
    ) {
      throw new BadRequestException(
        `Payment method type ${paymentMethod.type} is not supported for this flow`,
      );
    }
    return paymentMethod;
  }
}
