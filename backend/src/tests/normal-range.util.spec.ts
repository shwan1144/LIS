import { resolveNumericRange } from './normal-range.util';
import type { NumericRangeCarrier } from './normal-range.util';
import { getPatientAgeSnapshot } from '../patients/patient-age.util';

function createCarrier(
  overrides: Partial<NumericRangeCarrier> = {},
): NumericRangeCarrier {
  return {
    normalMin: null,
    normalMax: null,
    normalMinMale: null,
    normalMaxMale: null,
    normalMinFemale: null,
    normalMaxFemale: null,
    numericAgeRanges: null,
    ...overrides,
  };
}

describe('resolveNumericRange', () => {
  it('matches day-based age rules', () => {
    const carrier = createCarrier({
      numericAgeRanges: [
        {
          sex: 'ANY',
          ageUnit: 'DAY',
          minAge: 0,
          maxAge: 30,
          normalMin: 4,
          normalMax: 10,
        },
      ],
    });

    const range = resolveNumericRange(
      carrier,
      'M',
      getPatientAgeSnapshot('2026-03-04', '2026-03-09'),
    );

    expect(range).toEqual({
      normalMin: 4,
      normalMax: 10,
      source: 'age',
    });
  });

  it('matches month-based age rules', () => {
    const carrier = createCarrier({
      numericAgeRanges: [
        {
          sex: 'ANY',
          ageUnit: 'MONTH',
          minAge: 1,
          maxAge: 11,
          normalMin: 8,
          normalMax: 16,
        },
      ],
    });

    const range = resolveNumericRange(
      carrier,
      'F',
      getPatientAgeSnapshot('2025-09-09', '2026-03-09'),
    );

    expect(range).toEqual({
      normalMin: 8,
      normalMax: 16,
      source: 'age',
    });
  });

  it('matches year-based rules from legacy minAgeYears/maxAgeYears fields', () => {
    const carrier = createCarrier({
      numericAgeRanges: [
        {
          sex: 'ANY',
          minAgeYears: 1,
          maxAgeYears: 5,
          normalMin: 3,
          normalMax: 7,
        },
      ],
    });

    const range = resolveNumericRange(
      carrier,
      'M',
      getPatientAgeSnapshot('2023-03-09', '2026-03-09'),
    );

    expect(range).toEqual({
      normalMin: 3,
      normalMax: 7,
      source: 'age',
    });
  });

  it('prefers age-and-sex rules over sex-specific numeric ranges', () => {
    const carrier = createCarrier({
      normalMinMale: 10,
      normalMaxMale: 20,
      numericAgeRanges: [
        {
          sex: 'M',
          ageUnit: 'YEAR',
          minAge: 1,
          maxAge: 5,
          normalMin: 12,
          normalMax: 18,
        },
      ],
    });

    const range = resolveNumericRange(
      carrier,
      'male',
      getPatientAgeSnapshot('2023-03-09', '2026-03-09'),
    );

    expect(range).toEqual({
      normalMin: 12,
      normalMax: 18,
      source: 'age',
    });
  });

  it('falls back to sex-specific ranges before general ranges', () => {
    const carrier = createCarrier({
      normalMin: 1,
      normalMax: 9,
      normalMinFemale: 2,
      normalMaxFemale: 8,
    });

    const range = resolveNumericRange(
      carrier,
      'female',
      getPatientAgeSnapshot('1995-03-09', '2026-03-09'),
    );

    expect(range).toEqual({
      normalMin: 2,
      normalMax: 8,
      source: 'sex',
    });
  });
});
