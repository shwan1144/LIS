import { TestType, TubeType } from '../../entities/test.entity';
export declare class TestParameterDefinitionDto {
    code: string;
    label: string;
    type: 'select' | 'text';
    options?: string[];
    normalOptions?: string[];
    defaultValue?: string;
}
export declare class CreateTestDto {
    code: string;
    name: string;
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
    description?: string;
    childTestIds?: string;
    category?: string | null;
    parameterDefinitions?: TestParameterDefinitionDto[];
    departmentId?: string | null;
    isActive?: boolean;
    sortOrder?: number;
    expectedCompletionMinutes?: number | null;
}
