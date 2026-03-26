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
import { User } from '@stripe-app/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { BillingService } from './billing.service';

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

  @Get()
  getUserCharges(@Req() req: Request) {
    return this.billingService.getUserCharges((req.user as User).id);
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
