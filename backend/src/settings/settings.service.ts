import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { UserLabAssignment } from '../entities/user-lab-assignment.entity';
import { UserShiftAssignment } from '../entities/user-shift-assignment.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { hashPassword } from '../auth/password.util';

const ROLES = ['SUPER_ADMIN', 'LAB_ADMIN', 'RECEPTION', 'TECHNICIAN', 'VERIFIER', 'DOCTOR', 'INSTRUMENT_SERVICE'];
const MAX_REPORT_IMAGE_DATA_URL_LENGTH = 4 * 1024 * 1024;
const REPORT_IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[a-zA-Z0-9+/=]+$/;
const MAX_ONLINE_WATERMARK_TEXT_LENGTH = 120;

type ReportBrandingUpdate = {
  bannerDataUrl?: string | null;
  footerDataUrl?: string | null;
  logoDataUrl?: string | null;
  watermarkDataUrl?: string | null;
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserLabAssignment)
    private readonly labAssignmentRepo: Repository<UserLabAssignment>,
    @InjectRepository(UserShiftAssignment)
    private readonly shiftAssignmentRepo: Repository<UserShiftAssignment>,
    @InjectRepository(UserDepartmentAssignment)
    private readonly userDeptRepo: Repository<UserDepartmentAssignment>,
    @InjectRepository(Department)
    private readonly departmentRepo: Repository<Department>,
    @InjectRepository(Lab)
    private readonly labRepo: Repository<Lab>,
    @InjectRepository(Shift)
    private readonly shiftRepo: Repository<Shift>,
  ) {}

  getRoles(): string[] {
    return ROLES;
  }

  async getLabSettings(labId: string) {
    const lab = await this.labRepo.findOne({ where: { id: labId } });
    if (!lab) throw new NotFoundException('Lab not found');
    return {
      id: lab.id,
      code: lab.code,
      name: lab.name,
      labelSequenceBy: lab.labelSequenceBy ?? 'tube_type',
      sequenceResetBy: lab.sequenceResetBy ?? 'day',
      enableOnlineResults: lab.enableOnlineResults !== false,
      onlineResultWatermarkDataUrl: lab.onlineResultWatermarkDataUrl ?? null,
      onlineResultWatermarkText: lab.onlineResultWatermarkText ?? null,
      reportBranding: {
        bannerDataUrl: lab.reportBannerDataUrl ?? null,
        footerDataUrl: lab.reportFooterDataUrl ?? null,
        logoDataUrl: lab.reportLogoDataUrl ?? null,
        watermarkDataUrl: lab.reportWatermarkDataUrl ?? null,
      },
    };
  }

  async updateLabSettings(
    labId: string,
    data: {
      labelSequenceBy?: string;
      sequenceResetBy?: string;
      enableOnlineResults?: boolean;
      onlineResultWatermarkDataUrl?: string | null;
      onlineResultWatermarkText?: string | null;
      reportBranding?: ReportBrandingUpdate;
    },
  ) {
    const lab = await this.labRepo.findOne({ where: { id: labId } });
    if (!lab) throw new NotFoundException('Lab not found');
    if (data.labelSequenceBy !== undefined) {
      if (data.labelSequenceBy !== 'tube_type' && data.labelSequenceBy !== 'department') {
        throw new BadRequestException('labelSequenceBy must be tube_type or department');
      }
      lab.labelSequenceBy = data.labelSequenceBy;
    }
    if (data.sequenceResetBy !== undefined) {
      if (data.sequenceResetBy !== 'day' && data.sequenceResetBy !== 'shift') {
        throw new BadRequestException('sequenceResetBy must be day or shift');
      }
      lab.sequenceResetBy = data.sequenceResetBy;
    }
    if (data.enableOnlineResults !== undefined) {
      if (typeof data.enableOnlineResults !== 'boolean') {
        throw new BadRequestException('enableOnlineResults must be boolean');
      }
      lab.enableOnlineResults = data.enableOnlineResults;
    }
    if (data.onlineResultWatermarkDataUrl !== undefined) {
      lab.onlineResultWatermarkDataUrl = this.normalizeReportImageDataUrl(
        data.onlineResultWatermarkDataUrl,
        'onlineResultWatermarkDataUrl',
      );
    }
    if (data.onlineResultWatermarkText !== undefined) {
      lab.onlineResultWatermarkText = this.normalizeOnlineResultWatermarkText(
        data.onlineResultWatermarkText,
      );
    }
    if (data.reportBranding !== undefined) {
      if (
        !data.reportBranding ||
        typeof data.reportBranding !== 'object' ||
        Array.isArray(data.reportBranding)
      ) {
        throw new BadRequestException('reportBranding must be an object');
      }
      if ('bannerDataUrl' in data.reportBranding) {
        lab.reportBannerDataUrl = this.normalizeReportImageDataUrl(
          data.reportBranding.bannerDataUrl,
          'reportBranding.bannerDataUrl',
        );
      }
      if ('footerDataUrl' in data.reportBranding) {
        lab.reportFooterDataUrl = this.normalizeReportImageDataUrl(
          data.reportBranding.footerDataUrl,
          'reportBranding.footerDataUrl',
        );
      }
      if ('logoDataUrl' in data.reportBranding) {
        lab.reportLogoDataUrl = this.normalizeReportImageDataUrl(
          data.reportBranding.logoDataUrl,
          'reportBranding.logoDataUrl',
        );
      }
      if ('watermarkDataUrl' in data.reportBranding) {
        lab.reportWatermarkDataUrl = this.normalizeReportImageDataUrl(
          data.reportBranding.watermarkDataUrl,
          'reportBranding.watermarkDataUrl',
        );
      }
    }
    await this.labRepo.save(lab);
    return this.getLabSettings(labId);
  }

  private normalizeReportImageDataUrl(
    value: string | null | undefined,
    fieldName: string,
  ): string | null {
    if (value === null || value === undefined) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException(`${fieldName} must be a string or null`);
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > MAX_REPORT_IMAGE_DATA_URL_LENGTH) {
      throw new BadRequestException(`${fieldName} is too large`);
    }
    if (!REPORT_IMAGE_DATA_URL_PATTERN.test(trimmed)) {
      throw new BadRequestException(
        `${fieldName} must be a valid image data URL (png, jpg/jpeg, or webp)`,
      );
    }
    return trimmed;
  }

  private normalizeOnlineResultWatermarkText(value: string | null): string | null {
    if (value === null) return null;
    if (typeof value !== 'string') {
      throw new BadRequestException('onlineResultWatermarkText must be a string or null');
    }
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (trimmed.length > MAX_ONLINE_WATERMARK_TEXT_LENGTH) {
      throw new BadRequestException(
        `onlineResultWatermarkText must be at most ${MAX_ONLINE_WATERMARK_TEXT_LENGTH} characters`,
      );
    }
    return trimmed;
  }

  async getUsersForLab(labId: string): Promise<User[]> {
    const assignments = await this.labAssignmentRepo.find({
      where: { labId },
      relations: [
        'user',
        'user.shiftAssignments',
        'user.shiftAssignments.shift',
        'user.departmentAssignments',
        'user.departmentAssignments.department',
      ],
    });
    const users = assignments.map((a) => a.user);
    return users;
  }

  async getShiftsForLab(labId: string): Promise<Shift[]> {
    return this.shiftRepo.find({
      where: { labId },
      order: { code: 'ASC' },
    });
  }

  async getDepartmentsForLab(labId: string): Promise<Department[]> {
    return this.departmentRepo.find({
      where: { labId },
      order: { code: 'ASC' },
    });
  }

  async getUserWithDetails(id: string, labId: string): Promise<{
    user: User;
    labIds: string[];
    shiftIds: string[];
    departmentIds: string[];
  }> {
    const user = await this.userRepo.findOne({
      where: { id },
      relations: [
        'labAssignments',
        'shiftAssignments',
        'shiftAssignments.shift',
        'departmentAssignments',
        'departmentAssignments.department',
        'defaultLab',
      ],
    });
    if (!user) throw new NotFoundException('User not found');
    const inLab = user.labAssignments?.some((a) => a.labId === labId);
    if (!inLab) throw new NotFoundException('User not found in this lab');
    const departmentIds =
      user.departmentAssignments
        ?.filter((a) => a.department?.labId === labId)
        ?.map((a) => a.departmentId) ?? [];
    return {
      user,
      labIds: user.labAssignments?.map((a) => a.labId) ?? [],
      shiftIds: user.shiftAssignments?.map((a) => a.shiftId) ?? [],
      departmentIds,
    };
  }

  async createUser(labId: string, data: {
    username: string;
    password: string;
    fullName?: string;
    email?: string;
    role: string;
    shiftIds?: string[];
    departmentIds?: string[];
  }): Promise<User> {
    const existing = await this.userRepo.findOne({
      where: { username: data.username.trim(), labId },
    });
    if (existing) throw new ConflictException('Username already exists');
    if (!ROLES.includes(data.role)) throw new BadRequestException('Invalid role');
    const passwordHash = await hashPassword(data.password);
    const user = this.userRepo.create({
      username: data.username.trim(),
      labId,
      passwordHash,
      fullName: data.fullName?.trim() || null,
      email: data.email?.trim() || null,
      role: data.role,
      defaultLabId: labId,
      isActive: true,
    });
    const saved = await this.userRepo.save(user);
    await this.labAssignmentRepo.save({ userId: saved.id, labId });
    if (data.shiftIds?.length) {
      await this.ensureShiftsBelongToLab(data.shiftIds, labId);
      for (const shiftId of data.shiftIds) {
        await this.shiftAssignmentRepo.save({ userId: saved.id, shiftId }).catch(() => {});
      }
    }
    if (data.departmentIds?.length) {
      await this.ensureDepartmentsBelongToLab(data.departmentIds, labId);
      for (const departmentId of data.departmentIds) {
        await this.userDeptRepo.save({ userId: saved.id, departmentId }).catch(() => {});
      }
    }
    return this.userRepo.findOne({
      where: { id: saved.id },
      relations: [
        'labAssignments',
        'shiftAssignments',
        'shiftAssignments.shift',
        'departmentAssignments',
        'departmentAssignments.department',
      ],
    }) as Promise<User>;
  }

  async updateUser(id: string, labId: string, data: {
    fullName?: string;
    email?: string;
    role?: string;
    defaultLabId?: string;
    isActive?: boolean;
    shiftIds?: string[];
    departmentIds?: string[];
    password?: string;
  }): Promise<User> {
    const { user } = await this.getUserWithDetails(id, labId);
    if (data.fullName !== undefined) user.fullName = data.fullName?.trim() || null;
    if (data.email !== undefined) user.email = data.email?.trim() || null;
    if (data.role !== undefined) {
      if (!ROLES.includes(data.role)) throw new BadRequestException('Invalid role');
      user.role = data.role;
    }
    if (data.defaultLabId !== undefined) user.defaultLabId = data.defaultLabId || null;
    if (data.isActive !== undefined) user.isActive = data.isActive;
    if (data.password?.trim()) {
      user.passwordHash = await hashPassword(data.password.trim());
    }
    await this.userRepo.save(user);
    if (data.shiftIds !== undefined) {
      await this.shiftAssignmentRepo.delete({ userId: id });
      if (data.shiftIds.length) {
        await this.ensureShiftsBelongToLab(data.shiftIds, labId);
        for (const shiftId of data.shiftIds) {
          await this.shiftAssignmentRepo.save({ userId: id, shiftId }).catch(() => {});
        }
      }
    }
    if (data.departmentIds !== undefined) {
      await this.userDeptRepo.delete({ userId: id });
      if (data.departmentIds.length) {
        await this.ensureDepartmentsBelongToLab(data.departmentIds, labId);
        for (const departmentId of data.departmentIds) {
          await this.userDeptRepo.save({ userId: id, departmentId }).catch(() => {});
        }
      }
    }
    return this.userRepo.findOne({
      where: { id },
      relations: [
        'labAssignments',
        'shiftAssignments',
        'shiftAssignments.shift',
        'departmentAssignments',
        'departmentAssignments.department',
        'defaultLab',
      ],
    }) as Promise<User>;
  }

  private async ensureShiftsBelongToLab(shiftIds: string[], labId: string): Promise<void> {
    for (const shiftId of shiftIds) {
      const shift = await this.shiftRepo.findOne({ where: { id: shiftId } });
      if (!shift || shift.labId !== labId) throw new BadRequestException('Invalid shift for this lab');
    }
  }

  private async ensureDepartmentsBelongToLab(
    departmentIds: string[],
    labId: string,
  ): Promise<void> {
    for (const departmentId of departmentIds) {
      const dept = await this.departmentRepo.findOne({ where: { id: departmentId } });
      if (!dept || dept.labId !== labId) {
        throw new BadRequestException('Invalid department for this lab');
      }
    }
  }

  async deleteUser(userId: string, labId: string, currentUserId: string): Promise<void> {
    if (userId === currentUserId) {
      throw new BadRequestException('You cannot delete your own user');
    }
    const inLab = await this.labAssignmentRepo.findOne({ where: { userId, labId } });
    if (!inLab) throw new NotFoundException('User not found in this lab');
    await this.labAssignmentRepo.delete({ userId, labId });
    const shiftsInLab = await this.shiftRepo.find({ where: { labId }, select: ['id'] });
    const shiftIds = shiftsInLab.map((s) => s.id);
    if (shiftIds.length > 0) {
      await this.shiftAssignmentRepo
        .createQueryBuilder()
        .delete()
        .where('userId = :userId', { userId })
        .andWhere('shiftId IN (:...shiftIds)', { shiftIds })
        .execute();
    }
    const deptsInLab = await this.departmentRepo.find({ where: { labId }, select: ['id'] });
    const deptIds = deptsInLab.map((d) => d.id);
    if (deptIds.length > 0) {
      await this.userDeptRepo
        .createQueryBuilder()
        .delete()
        .where('userId = :userId', { userId })
        .andWhere('departmentId IN (:...deptIds)', { deptIds })
        .execute();
    }
    const remainingLabs = await this.labAssignmentRepo.count({ where: { userId } });
    if (remainingLabs === 0) {
      await this.shiftAssignmentRepo.delete({ userId });
      await this.userDeptRepo.delete({ userId });
      await this.userRepo.delete({ id: userId });
    }
  }
}
