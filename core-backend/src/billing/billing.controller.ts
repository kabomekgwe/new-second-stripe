import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { User } from '@stripe-app/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { BillingService } from './billing.service';

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
}
