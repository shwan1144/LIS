import { Repository } from 'typeorm';
import { Antibiotic } from '../entities/antibiotic.entity';
import { CreateAntibioticDto } from './dto/create-antibiotic.dto';
import { UpdateAntibioticDto } from './dto/update-antibiotic.dto';
export declare class AntibioticsService {
    private readonly antibioticRepo;
    constructor(antibioticRepo: Repository<Antibiotic>);
    findAll(labId: string, includeInactive: boolean): Promise<Antibiotic[]>;
    findOne(id: string, labId: string): Promise<Antibiotic>;
    create(labId: string, dto: CreateAntibioticDto): Promise<Antibiotic>;
    update(id: string, labId: string, dto: UpdateAntibioticDto): Promise<Antibiotic>;
    softDelete(id: string, labId: string): Promise<void>;
}
