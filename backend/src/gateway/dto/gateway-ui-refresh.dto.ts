import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GatewayUiRefreshDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  refreshToken: string;
}

