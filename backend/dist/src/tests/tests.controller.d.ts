import { TestsService } from './tests.service';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
interface RequestWithUser {
    user: {
        userId: string | null;
        username: string;
        labId: string;
    };
}
export declare class TestsController {
    private readonly testsService;
    constructor(testsService: TestsService);
    findAll(req: RequestWithUser, active?: string): Promise<import("../entities/test.entity").Test[]>;
    seedAll(req: RequestWithUser): Promise<{
        cbc: {
            created: number;
            skipped: number;
            tests: string[];
        };
        chemistry: {
            created: number;
            skipped: number;
            tests: string[];
        };
        urinalysis: {
            created: number;
            skipped: number;
            tests: string[];
        };
        total: {
            created: number;
            skipped: number;
        };
    }>;
    seedCBC(req: RequestWithUser): Promise<{
        created: number;
        skipped: number;
        tests: string[];
    }>;
    seedChemistry(req: RequestWithUser): Promise<{
        created: number;
        skipped: number;
        tests: string[];
    }>;
    seedUrinalysis(req: RequestWithUser): Promise<{
        created: number;
        skipped: number;
        tests: string[];
    }>;
    getPricing(req: RequestWithUser, id: string): Promise<{
        shiftId: string | null;
        shiftCode?: string;
        price: number;
    }[]>;
    setPricing(req: RequestWithUser, id: string, body: {
        prices: {
            shiftId: string | null;
            price: number;
        }[];
    }): Promise<{
        success: boolean;
    }>;
    findOne(req: RequestWithUser, id: string): Promise<import("../entities/test.entity").Test>;
    create(req: RequestWithUser, dto: CreateTestDto): Promise<import("../entities/test.entity").Test>;
    update(req: RequestWithUser, id: string, dto: UpdateTestDto): Promise<import("../entities/test.entity").Test>;
    delete(req: RequestWithUser, id: string): Promise<{
        success: boolean;
    }>;
    toggleActive(req: RequestWithUser, id: string): Promise<import("../entities/test.entity").Test>;
}
export {};
