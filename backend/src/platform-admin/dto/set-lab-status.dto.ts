import { IsBoolean, IsString, Length } from 'class-validator';

export class SetLabStatusDto {
  @IsBoolean()
  isActive: boolean;

  @IsString()
  @Length(3, 300)
  reason: string;
}

