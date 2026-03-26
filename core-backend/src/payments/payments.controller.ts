import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { Request } from 'express';
import { User } from '@stripe-app/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { PaymentsService } from './payments.service';
import { FxQuoteDto } from './dto/fx-quote.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Controller('payments')
@UseGuards(AuthenticatedGuard)
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}

  @Post('fx-quote')
  getFxQuote(@Req() req: Request, @Body() dto: FxQuoteDto) {
    return this.paymentsService.getFxQuote(
      (req.user as User).id,
      dto.amountGbp,
    );
  }

  @Post('create-intent')
  createPaymentIntent(@Req() req: Request, @Body() dto: CreatePaymentDto) {
    return this.paymentsService.createPaymentIntent(
      (req.user as User).id,
      dto,
    );
  }

  @Post('create-checkout-session')
  createCheckoutSession(@Req() req: Request, @Body() dto: CreateCheckoutSessionDto) {
    return this.paymentsService.createCheckoutSession(
      (req.user as User).id,
      dto,
    );
  }

  @Get()
  getPayments(@Req() req: Request) {
    return this.paymentsService.getPayments((req.user as User).id);
  }

  @Get(':id')
  getPaymentById(@Req() req: Request, @Param('id') id: string) {
    return this.paymentsService.getPaymentById((req.user as User).id, id);
  }
}
