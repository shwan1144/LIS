import { TestsService } from './tests.service';
import { CreateTestDto } from './dto/create-test.dto';
import { UpdateTestDto } from './dto/update-test.dto';
interface RequestWithUser {
    user: {
        userId: string;
        username: string;
        labId: string;
    };
}
export declare class TestsController {
    private readonly testsService;
    constructor(testsService: TestsService);
    findAll(active?: string): Promise<import("../entities/test.entity").Test[]>;
    seedAll(): Promise<{
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
        total: {
            created: number;
            skipped: number;
        };
    }>;
    seedCBC(): Promise<{
        created: number;
        skipped: number;
        tests: string[];
    }>;
    seedChemistry(): Promise<{
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
    findOne(id: string): Promise<import("../entities/test.entity").Test>;
    create(dto: CreateTestDto): Promise<import("../entities/test.entity").Test>;
    update(id: string, dto: UpdateTestDto): Promise<import("../entities/test.entity").Test>;
    delete(id: string): Promise<{
        success: boolean;
    }>;
    toggleActive(id: string): Promise<import("../entities/test.entity").Test>;
}
export {};
