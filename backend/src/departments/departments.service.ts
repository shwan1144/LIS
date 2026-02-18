import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Department } from '../entities/department.entity';

@Injectable()
export class DepartmentsService {
  constructor(
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
  ) {}

  async findAllByLab(labId: string): Promise<Department[]> {
    return this.departmentRepo.find({
      where: { labId },
      order: { code: 'ASC' },
    });
  }

  async findOne(id: string, labId: string): Promise<Department> {
    const dept = await this.departmentRepo.findOne({
      where: { id, labId },
    });
    if (!dept) throw new NotFoundException('Department not found');
    return dept;
  }

  async create(labId: string, data: { code: string; name?: string }): Promise<Department> {
    const code = data.code.trim().toUpperCase();
    const existing = await this.departmentRepo.findOne({
      where: { labId, code },
    });
    if (existing) {
      throw new ConflictException('Department with this code already exists for this lab');
    }
    const dept = this.departmentRepo.create({
      labId,
      code,
      name: data.name?.trim() || code,
    });
    return this.departmentRepo.save(dept);
  }

  async update(
    id: string,
    labId: string,
    data: { code?: string; name?: string },
  ): Promise<Department> {
    const dept = await this.findOne(id, labId);
    if (data.code !== undefined) {
      const code = data.code.trim().toUpperCase();
      const existing = await this.departmentRepo.findOne({
        where: { labId, code },
      });
      if (existing && existing.id !== id) {
        throw new ConflictException('Department with this code already exists for this lab');
      }
      dept.code = code;
    }
    if (data.name !== undefined) dept.name = data.name.trim() || dept.code;
    return this.departmentRepo.save(dept);
  }

  async delete(id: string, labId: string): Promise<void> {
    const dept = await this.findOne(id, labId);
    await this.departmentRepo.remove(dept);
  }
}
