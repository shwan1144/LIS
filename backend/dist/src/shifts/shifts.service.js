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
exports.ShiftsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const shift_entity_1 = require("../entities/shift.entity");
let ShiftsService = class ShiftsService {
    constructor(shiftRepo) {
        this.shiftRepo = shiftRepo;
    }
    async findAllByLab(labId) {
        return this.shiftRepo.find({
            where: { labId },
            order: { startTime: 'ASC', code: 'ASC' },
        });
    }
    async findOne(id, labId) {
        const shift = await this.shiftRepo.findOne({
            where: { id, labId },
        });
        if (!shift)
            throw new common_1.NotFoundException('Shift not found');
        return shift;
    }
    async create(labId, dto) {
        const existing = await this.shiftRepo.findOne({
            where: { labId, code: dto.code.trim().toUpperCase() },
        });
        if (existing) {
            throw new common_1.ConflictException(`Shift with code "${dto.code}" already exists for this lab`);
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
    async update(id, labId, dto) {
        const shift = await this.findOne(id, labId);
        if (dto.code !== undefined) {
            const existing = await this.shiftRepo.findOne({
                where: { labId, code: dto.code.trim().toUpperCase() },
            });
            if (existing && existing.id !== id) {
                throw new common_1.ConflictException(`Shift with code "${dto.code}" already exists for this lab`);
            }
            shift.code = dto.code.trim().toUpperCase();
        }
        if (dto.name !== undefined)
            shift.name = dto.name?.trim() || null;
        if (dto.startTime !== undefined)
            shift.startTime = this.normalizeTime(dto.startTime);
        if (dto.endTime !== undefined)
            shift.endTime = this.normalizeTime(dto.endTime);
        if (dto.isEmergency !== undefined)
            shift.isEmergency = dto.isEmergency;
        return this.shiftRepo.save(shift);
    }
    async delete(id, labId) {
        const shift = await this.findOne(id, labId);
        await this.shiftRepo.remove(shift);
    }
    normalizeTime(t) {
        if (!t?.trim())
            return null;
        const trimmed = t.trim();
        if (/^\d{1,2}:\d{2}$/.test(trimmed))
            return trimmed;
        if (/^\d{1,2}$/.test(trimmed))
            return trimmed.padStart(2, '0') + ':00';
        return null;
    }
};
exports.ShiftsService = ShiftsService;
exports.ShiftsService = ShiftsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(shift_entity_1.Shift)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], ShiftsService);
//# sourceMappingURL=shifts.service.js.map