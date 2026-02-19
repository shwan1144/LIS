import { OrderTest } from './order-test.entity';
import { Department } from './department.entity';
export interface TestParameterDefinition {
    code: string;
    label: string;
    type: 'select' | 'text';
    options?: string[];
    normalOptions?: string[];
    defaultValue?: string;
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
    code: string;
    name: string;
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
