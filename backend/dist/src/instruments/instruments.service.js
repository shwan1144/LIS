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
exports.InstrumentsService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const instrument_entity_1 = require("../entities/instrument.entity");
const test_entity_1 = require("../entities/test.entity");
const tcp_listener_service_1 = require("./tcp-listener.service");
let InstrumentsService = class InstrumentsService {
    constructor(instrumentRepo, mappingRepo, messageRepo, testRepo, tcpListener) {
        this.instrumentRepo = instrumentRepo;
        this.mappingRepo = mappingRepo;
        this.messageRepo = messageRepo;
        this.testRepo = testRepo;
        this.tcpListener = tcpListener;
    }
    async findAll(labId) {
        const instruments = await this.instrumentRepo.find({
            where: { labId },
            order: { code: 'ASC' },
        });
        return instruments.map((inst) => {
            const status = this.tcpListener.getConnectionStatus(inst.id);
            return {
                ...inst,
                _connectionStatus: status,
            };
        });
    }
    async findOne(id, labId) {
        const instrument = await this.instrumentRepo.findOne({
            where: { id, labId },
            relations: ['testMappings'],
        });
        if (!instrument) {
            throw new common_1.NotFoundException('Instrument not found');
        }
        return instrument;
    }
    async create(labId, dto) {
        const normalizedCode = dto.code.trim().toUpperCase();
        const existing = await this.instrumentRepo.findOne({
            where: { labId, code: normalizedCode },
        });
        if (existing) {
            throw new common_1.BadRequestException(`Instrument with code ${normalizedCode} already exists`);
        }
        const instrument = this.instrumentRepo.create({
            labId,
            ...dto,
            code: normalizedCode,
            status: instrument_entity_1.InstrumentStatus.OFFLINE,
        });
        const saved = await this.instrumentRepo.save(instrument);
        if (saved.isActive !== false && saved.port) {
            if (saved.connectionType === instrument_entity_1.ConnectionType.TCP_SERVER) {
                await this.tcpListener.startServer(saved);
            }
            else if (saved.connectionType === instrument_entity_1.ConnectionType.TCP_CLIENT && saved.host) {
                await this.tcpListener.connectToInstrument(saved);
            }
        }
        return saved;
    }
    async update(id, labId, dto) {
        const instrument = await this.findOne(id, labId);
        if (dto.code && dto.code !== instrument.code) {
            const normalizedCode = dto.code.trim().toUpperCase();
            const existing = await this.instrumentRepo.findOne({
                where: { labId, code: normalizedCode },
            });
            if (existing) {
                throw new common_1.BadRequestException(`Instrument with code ${normalizedCode} already exists`);
            }
            dto.code = normalizedCode;
        }
        Object.assign(instrument, dto);
        const saved = await this.instrumentRepo.save(instrument);
        if (dto.port !== undefined ||
            dto.host !== undefined ||
            dto.connectionType !== undefined ||
            dto.isActive !== undefined) {
            await this.tcpListener.restartListener(id);
        }
        return saved;
    }
    async delete(id, labId) {
        const instrument = await this.findOne(id, labId);
        await this.instrumentRepo.remove(instrument);
    }
    async toggleActive(id, labId) {
        const instrument = await this.findOne(id, labId);
        instrument.isActive = !instrument.isActive;
        const saved = await this.instrumentRepo.save(instrument);
        await this.tcpListener.restartListener(id);
        return saved;
    }
    async restartConnection(id, labId) {
        await this.findOne(id, labId);
        return this.tcpListener.restartListener(id);
    }
    async sendTestOrder(id, labId, dto) {
        const instrument = await this.findOne(id, labId);
        if (!instrument.bidirectionalEnabled) {
            throw new common_1.BadRequestException('Bidirectional mode is disabled for this instrument');
        }
        const orderNumber = dto.orderNumber?.trim() || dto.orderId?.trim() || '';
        if (!orderNumber || !dto.patientId?.trim() || !dto.patientName?.trim()) {
            throw new common_1.BadRequestException('orderNumber (or legacy orderId), patientId, and patientName are required');
        }
        const normalizedTests = (dto.tests || [])
            .map((test) => ({
            code: test.code?.trim(),
            name: test.name?.trim() || test.code?.trim(),
        }))
            .filter((test) => Boolean(test.code));
        if (normalizedTests.length === 0) {
            throw new common_1.BadRequestException('At least one test is required');
        }
        const sent = await this.tcpListener.sendOrder(instrument.id, {
            messageControlId: `ORM${Date.now()}`,
            sendingApplication: 'LIS',
            sendingFacility: instrument.sendingFacility || 'LAB',
            receivingApplication: instrument.receivingApplication || instrument.code,
            receivingFacility: instrument.receivingFacility || '',
            patientId: dto.patientId.trim(),
            patientName: dto.patientName.trim(),
            patientDob: dto.patientDob?.trim() || undefined,
            patientSex: dto.patientSex?.trim() || undefined,
            orderNumber,
            tests: normalizedTests,
            priority: dto.priority?.trim() || 'R',
        });
        if (!sent) {
            throw new common_1.BadRequestException('Failed to send order. Check instrument protocol, connection, and bidirectional mode.');
        }
        return {
            success: true,
            message: `Order ${orderNumber} sent to ${instrument.code}`,
        };
    }
    async getMappings(instrumentId, labId) {
        await this.findOne(instrumentId, labId);
        return this.mappingRepo.find({
            where: { instrumentId },
            order: { instrumentTestCode: 'ASC' },
        });
    }
    async getMappingsByTestId(testId, labId) {
        const test = await this.testRepo.findOne({ where: { id: testId, labId } });
        if (!test)
            throw new common_1.NotFoundException('Test not found');
        const mappings = await this.mappingRepo.find({
            where: { testId },
            relations: ['instrument'],
            order: { instrumentTestCode: 'ASC' },
        });
        return mappings.filter((m) => m.instrument?.labId === labId);
    }
    async createMapping(instrumentId, labId, dto) {
        await this.findOne(instrumentId, labId);
        const test = await this.testRepo.findOne({ where: { id: dto.testId, labId } });
        if (!test) {
            throw new common_1.NotFoundException('Test not found');
        }
        const existing = await this.mappingRepo.findOne({
            where: { instrumentId, instrumentTestCode: dto.instrumentTestCode },
        });
        if (existing) {
            throw new common_1.BadRequestException(`Mapping for code ${dto.instrumentTestCode} already exists`);
        }
        const mapping = this.mappingRepo.create({
            instrumentId,
            testId: dto.testId,
            instrumentTestCode: dto.instrumentTestCode,
            instrumentTestName: dto.instrumentTestName,
            multiplier: dto.multiplier,
        });
        return this.mappingRepo.save(mapping);
    }
    async updateMapping(instrumentId, mappingId, labId, dto) {
        await this.findOne(instrumentId, labId);
        const mapping = await this.mappingRepo.findOne({
            where: { id: mappingId, instrumentId },
        });
        if (!mapping) {
            throw new common_1.NotFoundException('Mapping not found');
        }
        if (dto.testId) {
            const test = await this.testRepo.findOne({ where: { id: dto.testId, labId } });
            if (!test) {
                throw new common_1.NotFoundException('Test not found');
            }
            mapping.testId = dto.testId;
        }
        if (dto.instrumentTestCode !== undefined)
            mapping.instrumentTestCode = dto.instrumentTestCode;
        if (dto.instrumentTestName !== undefined)
            mapping.instrumentTestName = dto.instrumentTestName || null;
        if (dto.multiplier !== undefined)
            mapping.multiplier = dto.multiplier || null;
        return this.mappingRepo.save(mapping);
    }
    async deleteMapping(instrumentId, mappingId, labId) {
        await this.findOne(instrumentId, labId);
        const mapping = await this.mappingRepo.findOne({
            where: { id: mappingId, instrumentId },
        });
        if (!mapping) {
            throw new common_1.NotFoundException('Mapping not found');
        }
        await this.mappingRepo.remove(mapping);
    }
    async getMessages(instrumentId, labId, params) {
        await this.findOne(instrumentId, labId);
        const page = params.page ?? 1;
        const size = params.size ?? 50;
        const skip = (page - 1) * size;
        const qb = this.messageRepo
            .createQueryBuilder('msg')
            .where('msg.instrumentId = :instrumentId', { instrumentId })
            .orderBy('msg.createdAt', 'DESC');
        if (params.direction) {
            qb.andWhere('msg.direction = :direction', { direction: params.direction });
        }
        const total = await qb.getCount();
        const items = await qb.skip(skip).take(size).getMany();
        return { items, total };
    }
    async simulateMessage(instrumentId, labId, rawMessage) {
        const instrument = await this.findOne(instrumentId, labId);
        return this.tcpListener.simulateMessage(instrument, rawMessage);
    }
};
exports.InstrumentsService = InstrumentsService;
exports.InstrumentsService = InstrumentsService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(instrument_entity_1.Instrument)),
    __param(1, (0, typeorm_1.InjectRepository)(instrument_entity_1.InstrumentTestMapping)),
    __param(2, (0, typeorm_1.InjectRepository)(instrument_entity_1.InstrumentMessage)),
    __param(3, (0, typeorm_1.InjectRepository)(test_entity_1.Test)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        tcp_listener_service_1.TCPListenerService])
], InstrumentsService);
//# sourceMappingURL=instruments.service.js.map