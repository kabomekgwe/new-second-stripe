import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
  constructor(
    private billingService: BillingService,
    private configService: ConfigService,
  ) {}

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

  /**
   * Test-only: trigger the monthly billing run for the current user.
   * Disabled in production.
   */
  @Post('trigger')
  async triggerBilling(@Req() req: Request) {
    if (this.configService.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('Not available in production');
    }
    const user = req.user as User;
    const fee = Number(user.monthlyManagementFee ?? 0);
    if (fee <= 0) {
      return { message: 'User has no monthlyManagementFee set' };
    }
    const charge = await this.billingService.chargeUser(user, fee);
    return toUsageChargeResponse(charge);
  }

  /**
   * Test-only: trigger the monthly billing run for ALL billable users.
   * Disabled in production.
   */
  @Post('trigger-all')
  async triggerAllBilling() {
    if (this.configService.get('NODE_ENV') === 'production') {
      throw new ForbiddenException('Not available in production');
    }
    return this.billingService.chargeAllUsers();
  }
}
