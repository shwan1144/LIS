import { IsNumber, Max, Min } from 'class-validator';

export class UpdateOrderDiscountDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent: number;
}
