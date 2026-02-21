import type { TestNumericAgeRange } from '../entities/test.entity';
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
export interface ResolvedNumericRange {
    normalMin: number | null;
    normalMax: number | null;
    source: 'age' | 'sex' | 'general' | 'none';
}
export declare function normalizePatientSex(value: string | null | undefined): 'M' | 'F' | null;
export declare function resolveNumericRange(test: NumericRangeCarrier, patientSexRaw: string | null | undefined, patientAgeYears: number | null): ResolvedNumericRange;
export {};
