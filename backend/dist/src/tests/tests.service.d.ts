import { Repository } from 'typeorm';
import { Test } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Department } from '../entities/department.entity';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
export declare class TestsService {
    private readonly testRepo;
    private readonly pricingRepo;
    private readonly testComponentRepo;
    private readonly orderTestRepo;
    private readonly departmentRepo;
    constructor(testRepo: Repository<Test>, pricingRepo: Repository<Pricing>, testComponentRepo: Repository<TestComponent>, orderTestRepo: Repository<OrderTest>, departmentRepo: Repository<Department>);
    findAll(labId: string, activeOnly?: boolean): Promise<Test[]>;
    findOne(id: string, labId: string): Promise<Test>;
    findByCode(code: string, labId: string): Promise<Test | null>;
    create(labId: string, dto: CreateTestDto): Promise<Test>;
    update(id: string, labId: string, dto: UpdateTestDto): Promise<Test>;
    private normalizeNumericAgeRanges;
    private normalizeResultEntryType;
    private normalizeResultTextOptions;
    private normalizeResultFlag;
    private validateResultEntryConfig;
    private isUuid;
    private resolvePanelComponentTestIds;
    private validatePanelComponents;
    private syncPanelComponentsForTest;
    private attachPanelComponents;
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
