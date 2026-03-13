import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

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
}
