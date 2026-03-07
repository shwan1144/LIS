import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CreateGatewayActivationCodeDto {
  @IsUUID()
  labId: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(60 * 24 * 30)
  expiresInMinutes?: number;
}
