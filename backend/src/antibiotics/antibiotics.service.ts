import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Antibiotic } from '../entities/antibiotic.entity';
import { CreateAntibioticDto } from './dto/create-antibiotic.dto';
import { UpdateAntibioticDto } from './dto/update-antibiotic.dto';

@Injectable()
export class AntibioticsService {
  constructor(
    @InjectRepository(Antibiotic)
    private readonly antibioticRepo: Repository<Antibiotic>,
  ) {}

  async findAll(labId: string, includeInactive: boolean): Promise<Antibiotic[]> {
    return this.antibioticRepo.find({
      where: includeInactive ? { labId } : { labId, isActive: true },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  }

  async findOne(id: string, labId: string): Promise<Antibiotic> {
    const antibiotic = await this.antibioticRepo.findOne({ where: { id, labId } });
    if (!antibiotic) {
      throw new NotFoundException('Antibiotic not found');
    }
    return antibiotic;
  }

  async create(labId: string, dto: CreateAntibioticDto): Promise<Antibiotic> {
    const code = dto.code.trim().toUpperCase();
    const name = dto.name.trim();
    if (!code || !name) {
      throw new BadRequestException('Antibiotic code and name are required');
    }
    const existing = await this.antibioticRepo.findOne({ where: { labId, code } });
    if (existing) {
      throw new ConflictException(`Antibiotic with code "${code}" already exists`);
    }
    const antibiotic = this.antibioticRepo.create({
      labId,
      code,
      name,
      isActive: dto.isActive ?? true,
      sortOrder: dto.sortOrder ?? 0,
    });
    return this.antibioticRepo.save(antibiotic);
  }

  async update(id: string, labId: string, dto: UpdateAntibioticDto): Promise<Antibiotic> {
    const antibiotic = await this.findOne(id, labId);
    if (dto.code !== undefined) {
      const nextCode = dto.code.trim().toUpperCase();
      if (!nextCode) {
        throw new BadRequestException('Antibiotic code cannot be empty');
      }
      const existing = await this.antibioticRepo.findOne({ where: { labId, code: nextCode } });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Antibiotic with code "${nextCode}" already exists`);
      }
      antibiotic.code = nextCode;
    }
    if (dto.name !== undefined) {
      const nextName = dto.name.trim();
      if (!nextName) {
        throw new BadRequestException('Antibiotic name cannot be empty');
      }
      antibiotic.name = nextName;
    }
    if (dto.isActive !== undefined) {
      antibiotic.isActive = dto.isActive;
    }
    if (dto.sortOrder !== undefined) {
      antibiotic.sortOrder = dto.sortOrder;
    }
    return this.antibioticRepo.save(antibiotic);
  }

  async softDelete(id: string, labId: string): Promise<void> {
    const antibiotic = await this.findOne(id, labId);
    antibiotic.isActive = false;
    await this.antibioticRepo.save(antibiotic);
  }
}
