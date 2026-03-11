import { AntibioticsService } from './antibiotics.service';
import { CreateAntibioticDto } from './dto/create-antibiotic.dto';
import { UpdateAntibioticDto } from './dto/update-antibiotic.dto';
interface RequestWithUser {
    user: {
        userId: string;
        username: string;
        labId: string;
    };
}
export declare class AntibioticsController {
    private readonly antibioticsService;
    constructor(antibioticsService: AntibioticsService);
    findAll(req: RequestWithUser, includeInactive?: string): Promise<import("../entities/antibiotic.entity").Antibiotic[]>;
    findOne(req: RequestWithUser, id: string): Promise<import("../entities/antibiotic.entity").Antibiotic>;
    create(req: RequestWithUser, dto: CreateAntibioticDto): Promise<import("../entities/antibiotic.entity").Antibiotic>;
    update(req: RequestWithUser, id: string, dto: UpdateAntibioticDto): Promise<import("../entities/antibiotic.entity").Antibiotic>;
    remove(req: RequestWithUser, id: string): Promise<{
        success: boolean;
    }>;
}
export {};
