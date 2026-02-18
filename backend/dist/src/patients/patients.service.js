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
exports.PatientsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const patient_entity_1 = require("../entities/patient.entity");
let PatientsService = class PatientsService {
    constructor(patientRepo) {
        this.patientRepo = patientRepo;
    }
    async search(params) {
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
            qb.andWhere('(p.fullName ILIKE :term OR p.phone ILIKE :term OR p.nationalId ILIKE :term OR p.patientNumber = :exactTerm)', { term, exactTerm });
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
    async findOne(id) {
        const patient = await this.patientRepo.findOne({ where: { id } });
        if (!patient)
            throw new common_1.NotFoundException('Patient not found');
        return patient;
    }
    async create(dto) {
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
    async generatePatientNumber() {
        const result = await this.patientRepo
            .createQueryBuilder('p')
            .select('MAX(p.patientNumber)', 'maxNum')
            .where("p.patientNumber LIKE 'P-%'")
            .getRawOne();
        const maxVal = result?.maxNum || 'P-000000';
        const num = parseInt(maxVal.replace(/^P-/, ''), 10) + 1;
        return `P-${num.toString().padStart(6, '0')}`;
    }
    async update(id, dto) {
        const patient = await this.findOne(id);
        await this.checkDuplicates(dto.nationalId !== undefined ? dto.nationalId : patient.nationalId, dto.phone !== undefined ? dto.phone : patient.phone, id);
        if (dto.fullName !== undefined)
            patient.fullName = dto.fullName.trim();
        if (dto.nationalId !== undefined)
            patient.nationalId = dto.nationalId?.trim() || null;
        if (dto.phone !== undefined)
            patient.phone = dto.phone?.trim() || null;
        if (dto.externalId !== undefined)
            patient.externalId = dto.externalId?.trim() || null;
        if (dto.dateOfBirth !== undefined)
            patient.dateOfBirth = dto.dateOfBirth || null;
        if (dto.sex !== undefined)
            patient.sex = dto.sex || null;
        if (dto.address !== undefined)
            patient.address = dto.address?.trim() || null;
        return this.patientRepo.save(patient);
    }
    async getTodayPatients() {
        const today = new Date();
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);
        return this.patientRepo.find({
            where: {
                createdAt: (0, typeorm_2.Between)(startOfDay, endOfDay),
            },
            order: { createdAt: 'DESC' },
        });
    }
    async checkDuplicates(nationalId, phone, excludeId) {
        if (nationalId?.trim()) {
            const existing = await this.patientRepo.findOne({
                where: { nationalId: nationalId.trim() },
            });
            if (existing && existing.id !== excludeId) {
                throw new common_1.ConflictException('A patient with this National ID already exists');
            }
        }
        if (phone?.trim()) {
            const existing = await this.patientRepo.findOne({
                where: { phone: phone.trim() },
            });
            if (existing && existing.id !== excludeId) {
                throw new common_1.ConflictException('A patient with this Phone number already exists');
            }
        }
    }
};
exports.PatientsService = PatientsService;
exports.PatientsService = PatientsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(patient_entity_1.Patient)),
    __metadata("design:paramtypes", [typeorm_2.Repository])
], PatientsService);
//# sourceMappingURL=patients.service.js.map