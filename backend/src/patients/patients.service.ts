import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between } from 'typeorm';
import { Patient } from '../entities/patient.entity';
import { CreatePatientDto } from './dto/create-patient.dto';
import { UpdatePatientDto } from './dto/update-patient.dto';

@Injectable()
export class PatientsService {
  constructor(
    @InjectRepository(Patient)
    private readonly patientRepo: Repository<Patient>,
  ) {}

  async search(params: {
    search?: string;
    nationalId?: string;
    phone?: string;
    page?: number;
    size?: number;
  }) {
    const page = Math.max(1, params.page ?? 1);
    const size = Math.min(100, Math.max(1, params.size ?? 20));
    const skip = (page - 1) * size;

    const qb = this.patientRepo.createQueryBuilder('p');

    if (params.nationalId?.trim()) {
      qb.andWhere('p.nationalId = :nationalId', { nationalId: params.nationalId.trim() });
    }
    if (params.phone?.trim()) {
      qb.andWhere('p.phone = :phone', { phone: params.phone.trim() });
    }
    if (params.search?.trim()) {
      const term = `%${params.search.trim()}%`;
      const exactTerm = params.search.trim();
      qb.andWhere(
        '(p.fullName ILIKE :term OR p.phone ILIKE :term OR p.nationalId ILIKE :term OR p.patientNumber = :exactTerm)',
        { term, exactTerm },
      );
    }

    qb.orderBy('p.updatedAt', 'DESC').skip(skip).take(size);

    const [items, total] = await qb.getManyAndCount();

    return {
      items,
      total,
      page,
      size,
      totalPages: Math.ceil(total / size),
    };
  }

  async findOne(id: string): Promise<Patient> {
    const patient = await this.patientRepo.findOne({ where: { id } });
    if (!patient) throw new NotFoundException('Patient not found');
    return patient;
  }

  async create(dto: CreatePatientDto): Promise<Patient> {
    await this.checkDuplicates(dto.nationalId ?? null, dto.phone ?? null, null);

    const patientNumber = await this.generatePatientNumber();
    const patient = this.patientRepo.create({
      patientNumber,
      nationalId: dto.nationalId?.trim() || null,
      phone: dto.phone?.trim() || null,
      externalId: dto.externalId?.trim() || null,
      fullName: dto.fullName.trim(),
      dateOfBirth: dto.dateOfBirth || null,
      sex: dto.sex || null,
      address: dto.address?.trim() || null,
    });
    return this.patientRepo.save(patient);
  }

  private async generatePatientNumber(): Promise<string> {
    const result = await this.patientRepo
      .createQueryBuilder('p')
      .select('MAX(p.patientNumber)', 'maxNum')
      .where("p.patientNumber LIKE 'P-%'")
      .getRawOne<{ maxNum: string | null }>();
    const maxVal = result?.maxNum || 'P-000000';
    const num = parseInt(maxVal.replace(/^P-/, ''), 10) + 1;
    return `P-${num.toString().padStart(6, '0')}`;
  }

  async update(id: string, dto: UpdatePatientDto): Promise<Patient> {
    const patient = await this.findOne(id);
    await this.checkDuplicates(
      dto.nationalId !== undefined ? dto.nationalId : patient.nationalId,
      dto.phone !== undefined ? dto.phone : patient.phone,
      id,
    );

    if (dto.fullName !== undefined) patient.fullName = dto.fullName.trim();
    if (dto.nationalId !== undefined) patient.nationalId = dto.nationalId?.trim() || null;
    if (dto.phone !== undefined) patient.phone = dto.phone?.trim() || null;
    if (dto.externalId !== undefined) patient.externalId = dto.externalId?.trim() || null;
    if (dto.dateOfBirth !== undefined) patient.dateOfBirth = dto.dateOfBirth || null;
    if (dto.sex !== undefined) patient.sex = dto.sex || null;
    if (dto.address !== undefined) patient.address = dto.address?.trim() || null;

    return this.patientRepo.save(patient);
  }

  async getTodayPatients(): Promise<Patient[]> {
    const today = new Date();
    const startOfDay = new Date(today);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(today);
    endOfDay.setHours(23, 59, 59, 999);

    return this.patientRepo.find({
      where: {
        createdAt: Between(startOfDay, endOfDay),
      },
      order: { createdAt: 'DESC' },
    });
  }

  private async checkDuplicates(
    nationalId: string | null,
    phone: string | null,
    excludeId: string | null,
  ): Promise<void> {
    if (nationalId?.trim()) {
      const existing = await this.patientRepo.findOne({
        where: { nationalId: nationalId.trim() },
      });
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('A patient with this National ID already exists');
      }
    }
    if (phone?.trim()) {
      const existing = await this.patientRepo.findOne({
        where: { phone: phone.trim() },
      });
      if (existing && existing.id !== excludeId) {
        throw new ConflictException('A patient with this Phone number already exists');
      }
    }
  }
}
