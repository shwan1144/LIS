import { DepartmentsService } from './departments.service';
interface RequestWithUser {
    user: {
        userId: string;
        username: string;
        labId: string;
    };
}
export declare class DepartmentsController {
    private readonly departmentsService;
    constructor(departmentsService: DepartmentsService);
    findAll(req: RequestWithUser): Promise<import("../entities/department.entity").Department[]>;
    findOne(req: RequestWithUser, id: string): Promise<import("../entities/department.entity").Department>;
    create(req: RequestWithUser, body: {
        code: string;
        name?: string;
    }): Promise<import("../entities/department.entity").Department>;
    update(req: RequestWithUser, id: string, body: {
        code?: string;
        name?: string;
    }): Promise<import("../entities/department.entity").Department>;
    delete(req: RequestWithUser, id: string): Promise<{
        success: boolean;
    }>;
}
export {};
