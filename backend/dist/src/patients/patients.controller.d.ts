import { PatientsService } from './patients.service';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
export declare class PatientsController {
    private readonly patientsService;
    constructor(patientsService: PatientsService);
    search(search?: string, nationalId?: string, phone?: string, page?: string, size?: string): Promise<{
        items: import("../entities/patient.entity").Patient[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    getTodayPatients(): Promise<import("../entities/patient.entity").Patient[]>;
    findOne(id: string): Promise<import("../entities/patient.entity").Patient>;
    create(dto: CreatePatientDto): Promise<import("../entities/patient.entity").Patient>;
    update(id: string, dto: UpdatePatientDto): Promise<import("../entities/patient.entity").Patient>;
}
