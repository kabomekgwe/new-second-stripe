import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Payment,
  User,
  PaymentStatus,
  FxQuoteResponse,
  CreatePaymentResponse,
} from '@stripe-app/shared';
import { StripeService } from '../stripe/stripe.service';
import { generateUniqueIdempotencyKey } from '../common/utils/idempotency';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private paymentRepo: Repository<Payment>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private stripeService: StripeService,
  ) {}

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

    const idempotencyKey = generateUniqueIdempotencyKey('fx_quote', userId, String(amountGbp), user.currency);

    const quote = await this.stripeService.createFxQuote(
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

    if (!user.stripeCustomerId) {
      throw new BadRequestException(
        'User does not have a Stripe customer account',
      );
    }

    const idempotencyKey = generateUniqueIdempotencyKey('payment', userId, String(dto.amountGbp), dto.paymentMethodId);

    const paymentIntent = await this.stripeService.createPaymentIntent(
      {
        amount: dto.amountGbp,
        customer: user.stripeCustomerId,
        payment_method: dto.paymentMethodId,
        automatic_payment_methods: {
          enabled: true,
          allow_redirects: 'never',
        },
        metadata: { userId, type: 'user_payment' },
        ...(dto.fxQuoteId ? { fx_quote: dto.fxQuoteId } : {}),
      } as any,
      idempotencyKey,
    );

    await this.paymentRepo.save(
      this.paymentRepo.create({
        userId,
        stripePaymentIntentId: paymentIntent.id,
        amountGbp: dto.amountGbp,
        fxQuoteId: dto.fxQuoteId ?? null,
        status: PaymentStatus.PENDING,
        paymentMethodId: dto.paymentMethodId,
        idempotencyKey,
      }),
    );

    return {
      clientSecret: paymentIntent.client_secret!,
      paymentIntentId: paymentIntent.id,
    };
  }

  async getPayments(userId: string): Promise<Payment[]> {
    return this.paymentRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async getPaymentById(userId: string, paymentId: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId, userId },
    });
    if (!payment) {
      throw new NotFoundException('Payment not found');
    }
    return payment;
  }

  private async findUserOrFail(userId: string): Promise<User> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }
}
