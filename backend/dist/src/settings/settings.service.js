"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SettingsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const bcrypt = require("bcrypt");
const user_entity_1 = require("../entities/user.entity");
const user_lab_assignment_entity_1 = require("../entities/user-lab-assignment.entity");
const user_shift_assignment_entity_1 = require("../entities/user-shift-assignment.entity");
const user_department_assignment_entity_1 = require("../entities/user-department-assignment.entity");
const department_entity_1 = require("../entities/department.entity");
const lab_entity_1 = require("../entities/lab.entity");
const shift_entity_1 = require("../entities/shift.entity");
const ROLES = ['SUPER_ADMIN', 'LAB_ADMIN', 'RECEPTION', 'TECHNICIAN', 'VERIFIER', 'DOCTOR', 'INSTRUMENT_SERVICE'];
const MAX_REPORT_IMAGE_DATA_URL_LENGTH = 4 * 1024 * 1024;
const REPORT_IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp);base64,[a-zA-Z0-9+/=]+$/;
const MAX_ONLINE_WATERMARK_TEXT_LENGTH = 120;
let SettingsService = class SettingsService {
    constructor(userRepo, labAssignmentRepo, shiftAssignmentRepo, userDeptRepo, departmentRepo, labRepo, shiftRepo) {
        this.userRepo = userRepo;
        this.labAssignmentRepo = labAssignmentRepo;
        this.shiftAssignmentRepo = shiftAssignmentRepo;
        this.userDeptRepo = userDeptRepo;
        this.departmentRepo = departmentRepo;
        this.labRepo = labRepo;
        this.shiftRepo = shiftRepo;
    }
    getRoles() {
        return ROLES;
    }
    async getLabSettings(labId) {
        const lab = await this.labRepo.findOne({ where: { id: labId } });
        if (!lab)
            throw new common_1.NotFoundException('Lab not found');
        return {
            id: lab.id,
            code: lab.code,
            name: lab.name,
            labelSequenceBy: lab.labelSequenceBy ?? 'tube_type',
            sequenceResetBy: lab.sequenceResetBy ?? 'day',
            enableOnlineResults: lab.enableOnlineResults !== false,
            onlineResultWatermarkText: lab.onlineResultWatermarkText ?? null,
            reportBranding: {
                bannerDataUrl: lab.reportBannerDataUrl ?? null,
                footerDataUrl: lab.reportFooterDataUrl ?? null,
                logoDataUrl: lab.reportLogoDataUrl ?? null,
                watermarkDataUrl: lab.reportWatermarkDataUrl ?? null,
            },
        };
    }
    async updateLabSettings(labId, data) {
        const lab = await this.labRepo.findOne({ where: { id: labId } });
        if (!lab)
            throw new common_1.NotFoundException('Lab not found');
        if (data.labelSequenceBy !== undefined) {
            if (data.labelSequenceBy !== 'tube_type' && data.labelSequenceBy !== 'department') {
                throw new common_1.BadRequestException('labelSequenceBy must be tube_type or department');
            }
            lab.labelSequenceBy = data.labelSequenceBy;
        }
        if (data.sequenceResetBy !== undefined) {
            if (data.sequenceResetBy !== 'day' && data.sequenceResetBy !== 'shift') {
                throw new common_1.BadRequestException('sequenceResetBy must be day or shift');
            }
            lab.sequenceResetBy = data.sequenceResetBy;
        }
        if (data.enableOnlineResults !== undefined) {
            if (typeof data.enableOnlineResults !== 'boolean') {
                throw new common_1.BadRequestException('enableOnlineResults must be boolean');
            }
            lab.enableOnlineResults = data.enableOnlineResults;
        }
        if (data.onlineResultWatermarkText !== undefined) {
            lab.onlineResultWatermarkText = this.normalizeOnlineResultWatermarkText(data.onlineResultWatermarkText);
        }
        if (data.reportBranding !== undefined) {
            if (!data.reportBranding ||
                typeof data.reportBranding !== 'object' ||
                Array.isArray(data.reportBranding)) {
                throw new common_1.BadRequestException('reportBranding must be an object');
            }
            if ('bannerDataUrl' in data.reportBranding) {
                lab.reportBannerDataUrl = this.normalizeReportImageDataUrl(data.reportBranding.bannerDataUrl, 'reportBranding.bannerDataUrl');
            }
            if ('footerDataUrl' in data.reportBranding) {
                lab.reportFooterDataUrl = this.normalizeReportImageDataUrl(data.reportBranding.footerDataUrl, 'reportBranding.footerDataUrl');
            }
            if ('logoDataUrl' in data.reportBranding) {
                lab.reportLogoDataUrl = this.normalizeReportImageDataUrl(data.reportBranding.logoDataUrl, 'reportBranding.logoDataUrl');
            }
            if ('watermarkDataUrl' in data.reportBranding) {
                lab.reportWatermarkDataUrl = this.normalizeReportImageDataUrl(data.reportBranding.watermarkDataUrl, 'reportBranding.watermarkDataUrl');
            }
        }
        await this.labRepo.save(lab);
        return this.getLabSettings(labId);
    }
    normalizeReportImageDataUrl(value, fieldName) {
        if (value === null || value === undefined)
            return null;
        if (typeof value !== 'string') {
            throw new common_1.BadRequestException(`${fieldName} must be a string or null`);
        }
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        if (trimmed.length > MAX_REPORT_IMAGE_DATA_URL_LENGTH) {
            throw new common_1.BadRequestException(`${fieldName} is too large`);
        }
        if (!REPORT_IMAGE_DATA_URL_PATTERN.test(trimmed)) {
            throw new common_1.BadRequestException(`${fieldName} must be a valid image data URL (png, jpg/jpeg, or webp)`);
        }
        return trimmed;
    }
    normalizeOnlineResultWatermarkText(value) {
        if (value === null)
            return null;
        if (typeof value !== 'string') {
            throw new common_1.BadRequestException('onlineResultWatermarkText must be a string or null');
        }
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        if (trimmed.length > MAX_ONLINE_WATERMARK_TEXT_LENGTH) {
            throw new common_1.BadRequestException(`onlineResultWatermarkText must be at most ${MAX_ONLINE_WATERMARK_TEXT_LENGTH} characters`);
        }
        return trimmed;
    }
    async getUsersForLab(labId) {
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
    async getUserWithDetails(id, labId) {
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
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const inLab = user.labAssignments?.some((a) => a.labId === labId);
        if (!inLab)
            throw new common_1.NotFoundException('User not found in this lab');
        const departmentIds = user.departmentAssignments
            ?.filter((a) => a.department?.labId === labId)
            ?.map((a) => a.departmentId) ?? [];
        return {
            user,
            labIds: user.labAssignments?.map((a) => a.labId) ?? [],
            shiftIds: user.shiftAssignments?.map((a) => a.shiftId) ?? [],
            departmentIds,
        };
    }
    async createUser(labId, data) {
        const existing = await this.userRepo.findOne({ where: { username: data.username.trim() } });
        if (existing)
            throw new common_1.ConflictException('Username already exists');
        if (!ROLES.includes(data.role))
            throw new common_1.BadRequestException('Invalid role');
        const passwordHash = await bcrypt.hash(data.password, 10);
        const user = this.userRepo.create({
            username: data.username.trim(),
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
                await this.shiftAssignmentRepo.save({ userId: saved.id, shiftId }).catch(() => { });
            }
        }
        if (data.departmentIds?.length) {
            await this.ensureDepartmentsBelongToLab(data.departmentIds, labId);
            for (const departmentId of data.departmentIds) {
                await this.userDeptRepo.save({ userId: saved.id, departmentId }).catch(() => { });
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
        });
    }
    async updateUser(id, labId, data) {
        const { user } = await this.getUserWithDetails(id, labId);
        if (data.fullName !== undefined)
            user.fullName = data.fullName?.trim() || null;
        if (data.email !== undefined)
            user.email = data.email?.trim() || null;
        if (data.role !== undefined) {
            if (!ROLES.includes(data.role))
                throw new common_1.BadRequestException('Invalid role');
            user.role = data.role;
        }
        if (data.defaultLabId !== undefined)
            user.defaultLabId = data.defaultLabId || null;
        if (data.isActive !== undefined)
            user.isActive = data.isActive;
        if (data.password?.trim()) {
            user.passwordHash = await bcrypt.hash(data.password.trim(), 10);
        }
        await this.userRepo.save(user);
        if (data.shiftIds !== undefined) {
            await this.shiftAssignmentRepo.delete({ userId: id });
            if (data.shiftIds.length) {
                await this.ensureShiftsBelongToLab(data.shiftIds, labId);
                for (const shiftId of data.shiftIds) {
                    await this.shiftAssignmentRepo.save({ userId: id, shiftId }).catch(() => { });
                }
            }
        }
        if (data.departmentIds !== undefined) {
            await this.userDeptRepo.delete({ userId: id });
            if (data.departmentIds.length) {
                await this.ensureDepartmentsBelongToLab(data.departmentIds, labId);
                for (const departmentId of data.departmentIds) {
                    await this.userDeptRepo.save({ userId: id, departmentId }).catch(() => { });
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
        });
    }
    async ensureShiftsBelongToLab(shiftIds, labId) {
        for (const shiftId of shiftIds) {
            const shift = await this.shiftRepo.findOne({ where: { id: shiftId } });
            if (!shift || shift.labId !== labId)
                throw new common_1.BadRequestException('Invalid shift for this lab');
        }
    }
    async ensureDepartmentsBelongToLab(departmentIds, labId) {
        for (const departmentId of departmentIds) {
            const dept = await this.departmentRepo.findOne({ where: { id: departmentId } });
            if (!dept || dept.labId !== labId) {
                throw new common_1.BadRequestException('Invalid department for this lab');
            }
        }
    }
    async deleteUser(userId, labId, currentUserId) {
        if (userId === currentUserId) {
            throw new common_1.BadRequestException('You cannot delete your own user');
        }
        const inLab = await this.labAssignmentRepo.findOne({ where: { userId, labId } });
        if (!inLab)
            throw new common_1.NotFoundException('User not found in this lab');
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
};
exports.SettingsService = SettingsService;
exports.SettingsService = SettingsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(user_lab_assignment_entity_1.UserLabAssignment)),
    __param(2, (0, typeorm_1.InjectRepository)(user_shift_assignment_entity_1.UserShiftAssignment)),
    __param(3, (0, typeorm_1.InjectRepository)(user_department_assignment_entity_1.UserDepartmentAssignment)),
    __param(4, (0, typeorm_1.InjectRepository)(department_entity_1.Department)),
    __param(5, (0, typeorm_1.InjectRepository)(lab_entity_1.Lab)),
    __param(6, (0, typeorm_1.InjectRepository)(shift_entity_1.Shift)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository])
], SettingsService);
//# sourceMappingURL=settings.service.js.map