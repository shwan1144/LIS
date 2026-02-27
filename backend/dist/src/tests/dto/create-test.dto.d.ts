import { TestType, TubeType } from '../../entities/test.entity';
export declare const TEST_RESULT_ENTRY_TYPES: readonly ["NUMERIC", "QUALITATIVE", "TEXT"];
export declare const TEST_RESULT_FLAGS: readonly ["N", "H", "L", "HH", "LL", "POS", "NEG", "ABN"];
export declare class TestParameterDefinitionDto {
    code: string;
    label: string;
    type: 'select' | 'text';
    options?: string[];
    normalOptions?: string[];
    defaultValue?: string;
}
export declare class TestNumericAgeRangeDto {
    sex: 'ANY' | 'M' | 'F';
    minAgeYears?: number | null;
    maxAgeYears?: number | null;
    normalMin?: number | null;
    normalMax?: number | null;
}
export declare class TestResultTextOptionDto {
    value: string;
    flag?: (typeof TEST_RESULT_FLAGS)[number] | null;
    isDefault?: boolean;
}
export declare class TestPanelComponentDto {
    childTestId: string;
    required?: boolean;
    sortOrder?: number;
    reportSection?: string | null;
    reportGroup?: string | null;
}
export declare class CreateTestDto {
    code: string;
    name: string;
    abbreviation?: string;
    type?: TestType;
    tubeType?: TubeType;
    unit?: string;
    normalMin?: number;
    normalMax?: number;
    normalMinMale?: number;
    normalMaxMale?: number;
    normalMinFemale?: number;
    normalMaxFemale?: number;
    normalText?: string;
    resultEntryType?: (typeof TEST_RESULT_ENTRY_TYPES)[number];
    resultTextOptions?: TestResultTextOptionDto[] | null;
    panelComponents?: TestPanelComponentDto[] | null;
    panelComponentTestIds?: string[] | null;
    allowCustomResultText?: boolean;
    numericAgeRanges?: TestNumericAgeRangeDto[];
    description?: string;
    childTestIds?: string;
    category?: string | null;
    parameterDefinitions?: TestParameterDefinitionDto[];
    departmentId?: string | null;
    isActive?: boolean;
    sortOrder?: number;
    expectedCompletionMinutes?: number | null;
}
