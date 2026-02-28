import {
  IsBoolean,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateLabDto {
  @IsString()
  @Length(2, 32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code can only contain letters, numbers, underscore, or dash',
  })
  code: string;

  @IsString()
  @Length(2, 255)
  name: string;

  @IsOptional()
  @IsString()
  @Length(2, 63)
  @Matches(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, {
    message: 'subdomain must be lowercase letters, numbers, and dashes only',
  })
  subdomain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
