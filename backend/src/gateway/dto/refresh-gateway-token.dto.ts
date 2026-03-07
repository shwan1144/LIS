import { IsString, Length, IsUUID } from 'class-validator';

export class RefreshGatewayTokenDto {
  @IsUUID()
  gatewayId: string;

  @IsString()
  @Length(20, 600)
  refreshToken: string;
}
