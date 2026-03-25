import { IsNumber, Min } from 'class-validator';

export class FxQuoteDto {
  @IsNumber()
  @Min(1)
  amountGbp: number; // in pence
}
