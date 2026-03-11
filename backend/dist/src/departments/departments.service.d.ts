import { Repository } from 'typeorm';
import { Department } from '../entities/department.entity';
export declare class DepartmentsService {
    private readonly departmentRepo;
    constructor(departmentRepo: Repository<Department>);
    findAllByLab(labId: string): Promise<Department[]>;
    findOne(id: string, labId: string): Promise<Department>;
    create(labId: string, data: {
        code: string;
        name?: string;
    }): Promise<Department>;
    update(id: string, labId: string, data: {
        code?: string;
        name?: string;
    }): Promise<Department>;
    delete(id: string, labId: string): Promise<void>;
}
