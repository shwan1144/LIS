import { Repository } from 'typeorm';
import { Shift } from '../entities/shift.entity';
export interface CreateShiftDto {
    code: string;
    name?: string;
    startTime?: string;
    endTime?: string;
    isEmergency?: boolean;
}
export interface UpdateShiftDto {
    code?: string;
    name?: string;
    startTime?: string;
    endTime?: string;
    isEmergency?: boolean;
}
export declare class ShiftsService {
    private readonly shiftRepo;
    constructor(shiftRepo: Repository<Shift>);
    findAllByLab(labId: string): Promise<Shift[]>;
    findOne(id: string, labId: string): Promise<Shift>;
    create(labId: string, dto: CreateShiftDto): Promise<Shift>;
    update(id: string, labId: string, dto: UpdateShiftDto): Promise<Shift>;
    delete(id: string, labId: string): Promise<void>;
    private normalizeTime;
}
