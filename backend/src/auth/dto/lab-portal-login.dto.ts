import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LabPortalLoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(512)
  token: string;
}
