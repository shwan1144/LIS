import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateOrderNotesDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  @Transform(({ value }) => {
    if (typeof value !== 'string') {
      return value ?? null;
    }
    const trimmed = value.trim();
    return trimmed || null;
  })
  notes?: string | null;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }
    if (typeof value !== 'string') {
      return value;
    }
    const trimmed = value.trim();
    return trimmed || null;
  })
  sourceSubLabId?: string | null;
}
