import { ArrayNotEmpty, ArrayUnique, IsArray, IsUUID } from 'class-validator';

export class UpdateOrderTestsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  testIds: string[];
}

