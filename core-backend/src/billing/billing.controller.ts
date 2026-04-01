import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsInt, Min, IsOptional, IsString } from 'class-validator';
import { Request } from 'express';
import { User, UsageCharge, UsageChargeResponse } from '@stripe-app/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { BillingService } from './billing.service';

function toUsageChargeResponse(charge: UsageCharge): UsageChargeResponse {
  return {
    id: charge.id,
    amountGbp: charge.amountGbp,
    description: charge.description,
    billingPeriodStart: charge.billingPeriodStart?.toISOString?.() ?? String(charge.billingPeriodStart),
    billingPeriodEnd: charge.billingPeriodEnd?.toISOString?.() ?? String(charge.billingPeriodEnd),
    status: charge.status,
    stripeInvoiceId: charge.stripeInvoiceId,
    stripeSubscriptionId: charge.stripeSubscriptionId,
    stripePaymentIntentId: charge.stripePaymentIntentId,
    createdAt: charge.createdAt?.toISOString?.() ?? String(charge.createdAt),
  };
}

class ChargeUserDto {
  @IsInt()
  @Min(1)
  amount: number; // in smallest currency unit (pence)

  @IsOptional()
  @IsString()
  description?: string;
}

@Controller('billing')
@UseGuards(AuthenticatedGuard)
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('health')
  checkHealth() {
    return this.billingService.checkBillingHealth();
  }

  @Get()
  async getUserCharges(@Req() req: Request) {
    const charges = await this.billingService.getUserCharges((req.user as User).id);
    return charges.map(toUsageChargeResponse);
  }

  @Get('current-fee')
  getCurrentFee(@Req() req: Request) {
    const user = req.user as User;
    return {
      monthlyManagementFee: user.monthlyManagementFee,
      accountValue: user.accountValue,
    };
  }

  @Post('charge')
  chargeCurrentUser(
    @Req() req: Request,
    @Body() dto: ChargeUserDto,
  ) {
    const user = req.user as User;
    return this.billingService.chargeUser(user, dto.amount, dto.description);
  }
}
