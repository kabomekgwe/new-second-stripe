import { IsNumber, IsString, IsOptional, IsNotEmpty, Min, Max } from 'class-validator';

export class CreatePaymentDto {
  @IsNumber()
  @Min(1)
  @Max(99999999) // £999,999.99 in pence
  amountGbp: number; // in pence

  @IsString()
  @IsNotEmpty()
  paymentMethodId: string; // Stripe PM ID (pm_xxx)

  @IsString()
  @IsOptional()
  fxQuoteId?: string;
}
