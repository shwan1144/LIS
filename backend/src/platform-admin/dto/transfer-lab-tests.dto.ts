import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class TransferLabTestsDto {
  @IsUUID()
  sourceLabId: string;

  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;
}
