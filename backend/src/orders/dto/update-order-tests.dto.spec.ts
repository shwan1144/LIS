import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdateOrderTestsDto } from './update-order-tests.dto';

describe('UpdateOrderTestsDto', () => {
  it('accepts verified-removal override fields', () => {
    const dto = plainToInstance(UpdateOrderTestsDto, {
      testIds: ['8d33c0cb-ec96-44be-bf02-7c0b2fe7b26e'],
      forceRemoveVerified: true,
      removalReason: '  Patient declined after physician clarification.  ',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.forceRemoveVerified).toBe(true);
    expect(dto.removalReason).toBe('Patient declined after physician clarification.');
  });

  it('rejects non-boolean verified-removal flags', () => {
    const dto = plainToInstance(UpdateOrderTestsDto, {
      testIds: ['8d33c0cb-ec96-44be-bf02-7c0b2fe7b26e'],
      forceRemoveVerified: 'yes',
    });

    const errors = validateSync(dto);
    const flagError = errors.find((error) => error.property === 'forceRemoveVerified');

    expect(flagError?.constraints?.isBoolean).toBeDefined();
  });
});
