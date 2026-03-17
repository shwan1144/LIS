import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateTestDto } from './create-test.dto';

describe('CreateTestDto numeric coercion', () => {
  const basePayload = {
    code: 'GLU',
    name: 'Glucose',
    abbreviation: 'GLU',
  };

  it('coerces top-level numeric string fields into numbers', () => {
    const dto = plainToInstance(CreateTestDto, {
      ...basePayload,
      normalMin: '20',
      normalMax: '30',
      normalMinMale: '18',
      normalMaxMale: '28',
      normalMinFemale: '17',
      normalMaxFemale: '27',
      sortOrder: '5',
      expectedCompletionMinutes: '120',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.normalMin).toBe(20);
    expect(dto.normalMax).toBe(30);
    expect(dto.normalMinMale).toBe(18);
    expect(dto.normalMaxMale).toBe(28);
    expect(dto.normalMinFemale).toBe(17);
    expect(dto.normalMaxFemale).toBe(27);
    expect(dto.sortOrder).toBe(5);
    expect(dto.expectedCompletionMinutes).toBe(120);
  });

  it('fails validation for non-numeric strings in numeric fields', () => {
    const dto = plainToInstance(CreateTestDto, {
      ...basePayload,
      normalMin: 'abc',
      normalMax: '30',
    });

    const errors = validateSync(dto);
    const normalMinError = errors.find((error) => error.property === 'normalMin');

    expect(normalMinError?.constraints).toBeDefined();
    expect(normalMinError?.constraints?.isNumber).toBeDefined();
  });

  it('coerces nested numericAgeRanges numeric strings into numbers', () => {
    const dto = plainToInstance(CreateTestDto, {
      ...basePayload,
      numericAgeRanges: [
        {
          sex: 'ANY',
          ageUnit: 'MONTH',
          minAge: '1',
          maxAge: '12',
          normalMin: '0.5',
          normalMax: '1.2',
        },
      ],
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.numericAgeRanges?.[0].ageUnit).toBe('MONTH');
    expect(dto.numericAgeRanges?.[0].minAge).toBe(1);
    expect(dto.numericAgeRanges?.[0].maxAge).toBe(12);
    expect(dto.numericAgeRanges?.[0].normalMin).toBe(0.5);
    expect(dto.numericAgeRanges?.[0].normalMax).toBe(1.2);
  });

  it('still coerces legacy year-only age range fields for compatibility', () => {
    const dto = plainToInstance(CreateTestDto, {
      ...basePayload,
      numericAgeRanges: [
        {
          sex: 'ANY',
          minAgeYears: '1',
          maxAgeYears: '12',
        },
      ],
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.numericAgeRanges?.[0].minAgeYears).toBe(1);
    expect(dto.numericAgeRanges?.[0].maxAgeYears).toBe(12);
  });

  it('trims abbreviation before validation', () => {
    const dto = plainToInstance(CreateTestDto, {
      ...basePayload,
      abbreviation: '  glu  ',
    });

    const errors = validateSync(dto);

    expect(errors).toHaveLength(0);
    expect(dto.abbreviation).toBe('glu');
  });

  it('fails validation when abbreviation is blank after trimming', () => {
    const dto = plainToInstance(CreateTestDto, {
      ...basePayload,
      abbreviation: '   ',
    });

    const errors = validateSync(dto);
    const abbreviationError = errors.find((error) => error.property === 'abbreviation');

    expect(abbreviationError?.constraints).toBeDefined();
    expect(abbreviationError?.constraints?.minLength).toBeDefined();
  });
});
