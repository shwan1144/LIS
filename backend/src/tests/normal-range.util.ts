import type {
  NumericAgeRangeSex,
  NumericAgeRangeUnit,
  TestNumericAgeRange,
} from '../entities/test.entity';
import type { PatientAgeSnapshot } from '../patients/patient-age.util';

type NumericLike = number | string | null | undefined;

export interface NumericRangeCarrier {
  normalMin: NumericLike;
  normalMax: NumericLike;
  normalMinMale: NumericLike;
  normalMaxMale: NumericLike;
  normalMinFemale: NumericLike;
  normalMaxFemale: NumericLike;
  numericAgeRanges?: TestNumericAgeRange[] | null;
}

export interface TextRangeCarrier {
  normalText?: string | null;
  normalTextMale?: string | null;
  normalTextFemale?: string | null;
}

export interface ResolvedNumericRange {
  normalMin: number | null;
  normalMax: number | null;
  source: 'age' | 'sex' | 'general' | 'none';
}

export interface NormalizedNumericAgeRange {
  sex: NumericAgeRangeSex;
  ageUnit: NumericAgeRangeUnit;
  minAge: number | null;
  maxAge: number | null;
  normalMin: number | null;
  normalMax: number | null;
}

function toNullableNumber(value: NumericLike): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function normalizePatientSex(value: string | null | undefined): 'M' | 'F' | null {
  if (!value) return null;
  const upper = value.trim().toUpperCase();
  if (upper === 'M' || upper === 'MALE') return 'M';
  if (upper === 'F' || upper === 'FEMALE') return 'F';
  return null;
}

function toNonEmptyText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  return value.length > 0 ? value : null;
}

export function resolveNormalText(
  test: TextRangeCarrier,
  patientSexRaw: string | null | undefined,
): string | null {
  const patientSex = normalizePatientSex(patientSexRaw);

  if (patientSex === 'M') {
    const maleText = toNonEmptyText(test.normalTextMale);
    if (maleText !== null) return maleText;
  }

  if (patientSex === 'F') {
    const femaleText = toNonEmptyText(test.normalTextFemale);
    if (femaleText !== null) return femaleText;
  }

  return toNonEmptyText(test.normalText);
}

function toAgeUnit(value: unknown): NumericAgeRangeUnit {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (normalized === 'DAY' || normalized === 'MONTH' || normalized === 'YEAR') {
    return normalized;
  }
  return 'YEAR';
}

function getAgeValueForUnit(
  patientAge: PatientAgeSnapshot | null,
  ageUnit: NumericAgeRangeUnit,
): number | null {
  if (!patientAge) return null;
  if (ageUnit === 'DAY') return patientAge.days;
  if (ageUnit === 'MONTH') return patientAge.months;
  return patientAge.years;
}

function toComparableAgeSpan(
  ageUnit: NumericAgeRangeUnit,
  minAge: number | null,
  maxAge: number | null,
): number {
  if (minAge === null || maxAge === null) return Number.POSITIVE_INFINITY;
  const unitFactor = ageUnit === 'DAY' ? 1 : ageUnit === 'MONTH' ? 30 : 365.25;
  return Math.max(0, maxAge - minAge) * unitFactor;
}

export function normalizeNumericAgeRange(
  range: TestNumericAgeRange,
): NormalizedNumericAgeRange {
  const sex = (range.sex || 'ANY').toUpperCase();
  const normalizedSex: NumericAgeRangeSex =
    sex === 'M' || sex === 'F' ? sex : 'ANY';
  const ageUnit = toAgeUnit(range.ageUnit);
  const minAge =
    range.minAge === undefined || range.minAge === null
      ? toNullableNumber(range.minAgeYears)
      : toNullableNumber(range.minAge);
  const maxAge =
    range.maxAge === undefined || range.maxAge === null
      ? toNullableNumber(range.maxAgeYears)
      : toNullableNumber(range.maxAge);

  return {
    sex: normalizedSex,
    ageUnit,
    minAge,
    maxAge,
    normalMin: toNullableNumber(range.normalMin),
    normalMax: toNullableNumber(range.normalMax),
  };
}

export function normalizeNumericAgeRanges(
  ranges: TestNumericAgeRange[] | null | undefined,
): NormalizedNumericAgeRange[] | null {
  if (!ranges?.length) return null;
  return ranges.map(normalizeNumericAgeRange);
}

function ageMatches(
  range: NormalizedNumericAgeRange,
  patientAge: PatientAgeSnapshot | null,
): boolean {
  const ageValue = getAgeValueForUnit(patientAge, range.ageUnit);

  if (ageValue === null) {
    // If age is unknown, only use unbounded age ranges.
    return range.minAge === null && range.maxAge === null;
  }

  if (range.minAge !== null && ageValue < range.minAge) return false;
  if (range.maxAge !== null && ageValue > range.maxAge) return false;
  return true;
}

function sexMatches(rangeSex: NumericAgeRangeSex, patientSex: 'M' | 'F' | null): boolean {
  if (rangeSex === 'ANY') return true;
  if (!patientSex) return false;
  return rangeSex === patientSex;
}

function getRangeSpecificityScore(
  range: NormalizedNumericAgeRange,
  patientSex: 'M' | 'F' | null,
  patientAge: PatientAgeSnapshot | null,
): number {
  let score = 0;

  // Prefer exact sex over ANY
  if (patientSex && range.sex === patientSex) score += 100;
  else if (range.sex === 'ANY') score += 50;

  if (range.minAge !== null && range.maxAge !== null) {
    score += 30;
  } else if (range.minAge !== null || range.maxAge !== null) {
    score += 15;
  }

  // If age is known, prefer narrower ranges.
  if (patientAge !== null) {
    const span = toComparableAgeSpan(range.ageUnit, range.minAge, range.maxAge);
    if (Number.isFinite(span)) {
      score += Math.max(0, 20 - Math.min(20, span));
    }
    if (range.ageUnit === 'DAY') score += 6;
    else if (range.ageUnit === 'MONTH') score += 3;
  }

  return score;
}

function resolveAgeSpecificRange(
  test: NumericRangeCarrier,
  patientSex: 'M' | 'F' | null,
  patientAge: PatientAgeSnapshot | null,
): { normalMin: number | null; normalMax: number | null } | null {
  const ranges = (test.numericAgeRanges ?? [])
    .map(normalizeNumericAgeRange)
    .filter((range) => {
      if (range.normalMin === null && range.normalMax === null) return false;
      if (!sexMatches(range.sex, patientSex)) return false;
      return ageMatches(range, patientAge);
    });

  if (!ranges.length) return null;

  ranges.sort((a, b) => {
    const scoreA = getRangeSpecificityScore(a, patientSex, patientAge);
    const scoreB = getRangeSpecificityScore(b, patientSex, patientAge);
    if (scoreA !== scoreB) return scoreB - scoreA;

    if (a.ageUnit !== b.ageUnit) {
      const weight = (ageUnit: NumericAgeRangeUnit) =>
        ageUnit === 'DAY' ? 0 : ageUnit === 'MONTH' ? 1 : 2;
      return weight(a.ageUnit) - weight(b.ageUnit);
    }

    const minA = a.minAge;
    const minB = b.minAge;
    if (minA !== minB) {
      if (minA === null) return 1;
      if (minB === null) return -1;
      return minB - minA;
    }

    const maxA = a.maxAge;
    const maxB = b.maxAge;
    if (maxA !== maxB) {
      if (maxA === null) return 1;
      if (maxB === null) return -1;
      return maxA - maxB;
    }

    return 0;
  });

  const best = ranges[0];
  return {
    normalMin: toNullableNumber(best.normalMin),
    normalMax: toNullableNumber(best.normalMax),
  };
}

export function resolveNumericRange(
  test: NumericRangeCarrier,
  patientSexRaw: string | null | undefined,
  patientAge: PatientAgeSnapshot | null,
): ResolvedNumericRange {
  const patientSex = normalizePatientSex(patientSexRaw);

  const ageSpecific = resolveAgeSpecificRange(test, patientSex, patientAge);
  if (ageSpecific) {
    return {
      normalMin: ageSpecific.normalMin,
      normalMax: ageSpecific.normalMax,
      source: 'age',
    };
  }

  const baseGeneralMin = toNullableNumber(test.normalMin);
  const baseGeneralMax = toNullableNumber(test.normalMax);

  if (patientSex === 'M') {
    const maleMin = toNullableNumber(test.normalMinMale);
    const maleMax = toNullableNumber(test.normalMaxMale);
    if (maleMin !== null || maleMax !== null) {
      return {
        normalMin: maleMin ?? baseGeneralMin,
        normalMax: maleMax ?? baseGeneralMax,
        source: 'sex',
      };
    }
  }

  if (patientSex === 'F') {
    const femaleMin = toNullableNumber(test.normalMinFemale);
    const femaleMax = toNullableNumber(test.normalMaxFemale);
    if (femaleMin !== null || femaleMax !== null) {
      return {
        normalMin: femaleMin ?? baseGeneralMin,
        normalMax: femaleMax ?? baseGeneralMax,
        source: 'sex',
      };
    }
  }

  if (baseGeneralMin !== null || baseGeneralMax !== null) {
    return {
      normalMin: baseGeneralMin,
      normalMax: baseGeneralMax,
      source: 'general',
    };
  }

  return {
    normalMin: null,
    normalMax: null,
    source: 'none',
  };
}
