import { IsOptional, IsString, Length } from 'class-validator';

export class ActivateGatewayDto {
  @IsString()
  @Length(6, 120)
  activationCode: string;

  @IsString()
  @Length(1, 120)
  deviceName: string;

  @IsString()
  @Length(8, 300)
  machineFingerprint: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  gatewayVersion?: string;
}
