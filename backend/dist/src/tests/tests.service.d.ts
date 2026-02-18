import { Repository } from 'typeorm';
import { Test } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { OrderTest } from '../entities/order-test.entity';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
export declare class TestsService {
    private readonly testRepo;
    private readonly pricingRepo;
    private readonly testComponentRepo;
    private readonly orderTestRepo;
    constructor(testRepo: Repository<Test>, pricingRepo: Repository<Pricing>, testComponentRepo: Repository<TestComponent>, orderTestRepo: Repository<OrderTest>);
    findAll(activeOnly?: boolean): Promise<Test[]>;
    findOne(id: string): Promise<Test>;
    findByCode(code: string): Promise<Test | null>;
    create(dto: CreateTestDto): Promise<Test>;
    update(id: string, dto: UpdateTestDto): Promise<Test>;
    delete(id: string): Promise<void>;
    toggleActive(id: string): Promise<Test>;
    getPricingForTest(testId: string, labId: string): Promise<{
        shiftId: string | null;
        shiftCode?: string;
        price: number;
    }[]>;
    setPricingForTest(testId: string, labId: string, prices: {
        shiftId: string | null;
        price: number;
    }[]): Promise<void>;
    seedCBCTests(): Promise<{
        created: number;
        skipped: number;
        tests: string[];
    }>;
    private getReportSection;
    private getReportGroup;
    seedChemistryTests(): Promise<{
        created: number;
        skipped: number;
        tests: string[];
    }>;
}
