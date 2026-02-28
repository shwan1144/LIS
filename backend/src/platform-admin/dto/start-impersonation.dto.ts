import { IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class StartImpersonationDto {
  @IsUUID()
  labId: string;

  @IsString()
  @MinLength(3)
  @MaxLength(300)
  reason: string;
}
