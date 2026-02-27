import { OrderTest } from './order-test.entity';
import { Department } from './department.entity';
import { Lab } from './lab.entity';
export interface TestParameterDefinition {
    code: string;
    label: string;
    type: 'select' | 'text';
    options?: string[];
    normalOptions?: string[];
    defaultValue?: string;
}
export type NumericAgeRangeSex = 'ANY' | 'M' | 'F';
export interface TestNumericAgeRange {
    sex: NumericAgeRangeSex;
    minAgeYears?: number | null;
    maxAgeYears?: number | null;
    normalMin?: number | null;
    normalMax?: number | null;
}
export type TestResultEntryType = 'NUMERIC' | 'QUALITATIVE' | 'TEXT';
export type TestResultFlag = 'N' | 'H' | 'L' | 'HH' | 'LL' | 'POS' | 'NEG' | 'ABN';
export interface TestResultTextOption {
    value: string;
    flag?: TestResultFlag | null;
    isDefault?: boolean;
}
export declare enum TestType {
    SINGLE = "SINGLE",
    PANEL = "PANEL"
}
export declare enum TubeType {
    SERUM = "SERUM",
    PLASMA = "PLASMA",
    WHOLE_BLOOD = "WHOLE_BLOOD",
    URINE = "URINE",
    STOOL = "STOOL",
    SWAB = "SWAB",
    CSF = "CSF",
    OTHER = "OTHER"
}
export declare class Test {
    id: string;
    labId: string;
    lab: Lab;
    code: string;
    name: string;
    abbreviation: string | null;
    type: TestType;
    tubeType: TubeType;
    departmentId: string | null;
    department: Department | null;
    category: string | null;
    unit: string | null;
    normalMin: number | null;
    normalMax: number | null;
    normalMinMale: number | null;
    normalMaxMale: number | null;
    normalMinFemale: number | null;
    normalMaxFemale: number | null;
    normalText: string | null;
    resultEntryType: TestResultEntryType;
    resultTextOptions: TestResultTextOption[] | null;
    allowCustomResultText: boolean;
    numericAgeRanges: TestNumericAgeRange[] | null;
    description: string | null;
    childTestIds: string | null;
    parameterDefinitions: TestParameterDefinition[] | null;
    isActive: boolean;
    sortOrder: number;
    expectedCompletionMinutes: number | null;
    createdAt: Date;
    updatedAt: Date;
    orderTests: OrderTest[];
}
