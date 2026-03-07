import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class GatewayUiLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  labCode: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  password: string;
}

