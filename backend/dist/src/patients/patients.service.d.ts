import { Repository } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';
export declare class PatientsService {
    private readonly patientRepo;
    constructor(patientRepo: Repository<Patient>);
    search(params: {
        search?: string;
        nationalId?: string;
        phone?: string;
        page?: number;
        size?: number;
    }): Promise<{
        items: Patient[];
        total: number;
        page: number;
        size: number;
        totalPages: number;
    }>;
    findOne(id: string): Promise<Patient>;
    create(dto: CreatePatientDto): Promise<Patient>;
    private generatePatientNumber;
    update(id: string, dto: UpdatePatientDto): Promise<Patient>;
    getTodayPatients(): Promise<Patient[]>;
    private checkDuplicates;
}
