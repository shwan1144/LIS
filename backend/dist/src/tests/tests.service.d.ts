import { Repository } from 'typeorm';
import { Test, TestType } from '../entities/test.entity';
import { Antibiotic } from '../entities/antibiotic.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { TestAntibiotic } from '../entities/test-antibiotic.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Department } from '../entities/department.entity';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
export interface TestPanelComponentView {
    childTestId: string;
    required: boolean;
    sortOrder: number;
    reportSection: string | null;
    reportGroup: string | null;
    childTest: {
        id: string;
        code: string;
        name: string;
        type: TestType;
        unit: string | null;
        isActive: boolean;
    };
}
type TestWithPanelComponents = Test & {
    panelComponents?: TestPanelComponentView[];
};
export type TestListItem = TestWithPanelComponents & {
    defaultPrice: number | null;
};
export declare class TestsService {
    private readonly testRepo;
    private readonly pricingRepo;
    private readonly testComponentRepo;
    private readonly testAntibioticRepo;
    private readonly antibioticRepo;
    private readonly orderTestRepo;
    private readonly departmentRepo;
    constructor(testRepo: Repository<Test>, pricingRepo: Repository<Pricing>, testComponentRepo: Repository<TestComponent>, testAntibioticRepo: Repository<TestAntibiotic>, antibioticRepo: Repository<Antibiotic>, orderTestRepo: Repository<OrderTest>, departmentRepo: Repository<Department>);
    findAll(labId: string, activeOnly?: boolean): Promise<TestListItem[]>;
    findOne(id: string, labId: string): Promise<Test>;
    findByCode(code: string, labId: string): Promise<Test | null>;
    create(labId: string, dto: CreateTestDto): Promise<Test>;
    update(id: string, labId: string, dto: UpdateTestDto): Promise<Test>;
    private normalizeNumericAgeRanges;
    private toNullableRawText;
    private normalizeResultEntryType;
    private normalizeCultureConfig;
    private normalizeParameterDefinitions;
    private normalizeResultTextOptions;
    private normalizeResultFlag;
    private normalizeTestForOutput;
    private validateResultEntryConfig;
    private isUuid;
    private resolvePanelComponentTestIds;
    private validatePanelComponents;
    private syncPanelComponentsForTest;
    private attachPanelComponents;
    private attachCultureAntibioticIds;
    private syncCultureAntibioticsForTest;
    private attachDefaultPrices;
    delete(id: string, labId: string): Promise<void>;
    toggleActive(id: string, labId: string): Promise<Test>;
    getPricingForTest(testId: string, labId: string): Promise<{
        shiftId: string | null;
        shiftCode?: string;
        price: number;
    }[]>;
    setPricingForTest(testId: string, labId: string, prices: {
        shiftId: string | null;
        price: number;
    }[]): Promise<void>;
    private ensureDepartmentBelongsToLab;
    seedCBCTests(labId: string): Promise<{
        created: number;
        skipped: number;
        tests: string[];
    }>;
    private getReportSection;
    private getReportGroup;
    seedUrinalysisTests(labId: string): Promise<{
        created: number;
        skipped: number;
        tests: string[];
    }>;
    seedChemistryTests(labId: string): Promise<{
        created: number;
        skipped: number;
        tests: string[];
    }>;
}
export {};
