import { TestType, TubeType } from '../../entities/test.entity';
export declare const TEST_RESULT_ENTRY_TYPES: readonly ["NUMERIC", "QUALITATIVE", "TEXT", "CULTURE_SENSITIVITY", "PDF_UPLOAD"];
export declare const TEST_RESULT_FLAGS: readonly ["N", "H", "L", "POS", "NEG", "ABN"];
export declare const TEST_NUMERIC_AGE_UNITS: readonly ["DAY", "MONTH", "YEAR"];
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
    ageUnit?: (typeof TEST_NUMERIC_AGE_UNITS)[number] | null;
    minAge?: number | null;
    maxAge?: number | null;
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
export declare class TestCultureConfigDto {
    interpretationOptions: string[];
    micUnit?: string | null;
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
    abbreviation: string;
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
    normalTextMale?: string;
    normalTextFemale?: string;
    resultEntryType?: (typeof TEST_RESULT_ENTRY_TYPES)[number];
    resultTextOptions?: TestResultTextOptionDto[] | null;
    panelComponents?: TestPanelComponentDto[] | null;
    panelComponentTestIds?: string[] | null;
    allowCustomResultText?: boolean;
    allowPanelSaveWithChildDefaults?: boolean;
    cultureConfig?: TestCultureConfigDto | null;
    cultureAntibioticIds?: string[] | null;
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
