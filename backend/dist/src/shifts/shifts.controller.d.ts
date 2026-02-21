import { ShiftsService } from './shifts.service';
interface RequestWithUser {
    user: {
        userId: string;
        username: string;
        labId: string;
    };
}
export declare class ShiftsController {
    private readonly shiftsService;
    constructor(shiftsService: ShiftsService);
    findAll(req: RequestWithUser): Promise<import("../entities/shift.entity").Shift[]>;
    findOne(req: RequestWithUser, id: string): Promise<import("../entities/shift.entity").Shift>;
    create(req: RequestWithUser, body: {
        code: string;
        name?: string;
        startTime?: string;
        endTime?: string;
        isEmergency?: boolean;
    }): Promise<import("../entities/shift.entity").Shift>;
    update(req: RequestWithUser, id: string, body: {
        code?: string;
        name?: string;
        startTime?: string;
        endTime?: string;
        isEmergency?: boolean;
    }): Promise<import("../entities/shift.entity").Shift>;
    delete(req: RequestWithUser, id: string): Promise<{
        success: boolean;
    }>;
}
export {};
