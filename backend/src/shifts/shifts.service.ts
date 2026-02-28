import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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

@Injectable()
export class ShiftsService {
  constructor(
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
  ) {}

  async findAllByLab(labId: string): Promise<Shift[]> {
    return this.shiftRepo.find({
      where: { labId },
      order: { startTime: 'ASC', code: 'ASC' },
    });
  }

  async findOne(id: string, labId: string): Promise<Shift> {
    const shift = await this.shiftRepo.findOne({
      where: { id, labId },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    return shift;
  }

  async create(labId: string, dto: CreateShiftDto): Promise<Shift> {
    const existing = await this.shiftRepo.findOne({
      where: { labId, code: dto.code.trim().toUpperCase() },
    });
    if (existing) {
      throw new ConflictException(`Shift with code "${dto.code}" already exists for this lab`);
    }
    const shift = this.shiftRepo.create({
      labId,
      code: dto.code.trim().toUpperCase(),
      name: dto.name?.trim() || null,
      startTime: this.normalizeTime(dto.startTime),
      endTime: this.normalizeTime(dto.endTime),
      isEmergency: dto.isEmergency ?? false,
    });
    return this.shiftRepo.save(shift);
  }

  async update(id: string, labId: string, dto: UpdateShiftDto): Promise<Shift> {
    const shift = await this.findOne(id, labId);
    if (dto.code !== undefined) {
      const existing = await this.shiftRepo.findOne({
        where: { labId, code: dto.code.trim().toUpperCase() },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException(`Shift with code "${dto.code}" already exists for this lab`);
      }
      shift.code = dto.code.trim().toUpperCase();
    }
    if (dto.name !== undefined) shift.name = dto.name?.trim() || null;
    if (dto.startTime !== undefined) shift.startTime = this.normalizeTime(dto.startTime);
    if (dto.endTime !== undefined) shift.endTime = this.normalizeTime(dto.endTime);
    if (dto.isEmergency !== undefined) shift.isEmergency = dto.isEmergency;
    return this.shiftRepo.save(shift);
  }

  async delete(id: string, labId: string): Promise<void> {
    const shift = await this.findOne(id, labId);
    await this.shiftRepo.remove(shift);
  }

  private normalizeTime(t: string | undefined): string | null {
    if (!t?.trim()) return null;
    const trimmed = t.trim();
    if (/^\d{1,2}:\d{2}$/.test(trimmed)) return trimmed;
    if (/^\d{1,2}$/.test(trimmed)) return trimmed.padStart(2, '0') + ':00';
    return null;
  }
}
