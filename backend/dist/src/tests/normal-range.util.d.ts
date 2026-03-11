import type { NumericAgeRangeSex, NumericAgeRangeUnit, TestNumericAgeRange } from '../entities/test.entity';
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
export declare function normalizePatientSex(value: string | null | undefined): 'M' | 'F' | null;
export declare function resolveNormalText(test: TextRangeCarrier, patientSexRaw: string | null | undefined): string | null;
export declare function normalizeNumericAgeRange(range: TestNumericAgeRange): NormalizedNumericAgeRange;
export declare function normalizeNumericAgeRanges(ranges: TestNumericAgeRange[] | null | undefined): NormalizedNumericAgeRange[] | null;
export declare function resolveNumericRange(test: NumericRangeCarrier, patientSexRaw: string | null | undefined, patientAge: PatientAgeSnapshot | null): ResolvedNumericRange;
export {};
