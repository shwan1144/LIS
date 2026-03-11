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
exports.AntibioticsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const antibiotic_entity_1 = require("../entities/antibiotic.entity");
let AntibioticsService = class AntibioticsService {
    constructor(antibioticRepo) {
        this.antibioticRepo = antibioticRepo;
    }
    async findAll(labId, includeInactive) {
        return this.antibioticRepo.find({
            where: includeInactive ? { labId } : { labId, isActive: true },
            order: { sortOrder: 'ASC', code: 'ASC' },
        });
    }
    async findOne(id, labId) {
        const antibiotic = await this.antibioticRepo.findOne({ where: { id, labId } });
        if (!antibiotic) {
            throw new common_1.NotFoundException('Antibiotic not found');
        }
        return antibiotic;
    }
    async create(labId, dto) {
        const code = dto.code.trim().toUpperCase();
        const name = dto.name.trim();
        if (!code || !name) {
            throw new common_1.BadRequestException('Antibiotic code and name are required');
        }
        const existing = await this.antibioticRepo.findOne({ where: { labId, code } });
        if (existing) {
            throw new common_1.ConflictException(`Antibiotic with code "${code}" already exists`);
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
    async update(id, labId, dto) {
        const antibiotic = await this.findOne(id, labId);
        if (dto.code !== undefined) {
            const nextCode = dto.code.trim().toUpperCase();
            if (!nextCode) {
                throw new common_1.BadRequestException('Antibiotic code cannot be empty');
            }
            const existing = await this.antibioticRepo.findOne({ where: { labId, code: nextCode } });
            if (existing && existing.id !== id) {
                throw new common_1.ConflictException(`Antibiotic with code "${nextCode}" already exists`);
            }
            antibiotic.code = nextCode;
        }
        if (dto.name !== undefined) {
            const nextName = dto.name.trim();
            if (!nextName) {
                throw new common_1.BadRequestException('Antibiotic name cannot be empty');
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
    async softDelete(id, labId) {
        const antibiotic = await this.findOne(id, labId);
        antibiotic.isActive = false;
        await this.antibioticRepo.save(antibiotic);
    }
};
exports.AntibioticsService = AntibioticsService;
exports.AntibioticsService = AntibioticsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(antibiotic_entity_1.Antibiotic)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], AntibioticsService);
//# sourceMappingURL=antibiotics.service.js.map