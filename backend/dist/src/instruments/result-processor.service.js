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
var InstrumentResultProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstrumentResultProcessor = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const instrument_entity_1 = require("../entities/instrument.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const sample_entity_1 = require("../entities/sample.entity");
const order_entity_1 = require("../entities/order.entity");
const hl7_parser_service_1 = require("./hl7-parser.service");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
let InstrumentResultProcessor = InstrumentResultProcessor_1 = class InstrumentResultProcessor {
    constructor(mappingRepo, orderTestRepo, sampleRepo, orderRepo, hl7Parser, auditService) {
        this.mappingRepo = mappingRepo;
        this.orderTestRepo = orderTestRepo;
        this.sampleRepo = sampleRepo;
        this.orderRepo = orderRepo;
        this.hl7Parser = hl7Parser;
        this.auditService = auditService;
        this.logger = new common_1.Logger(InstrumentResultProcessor_1.name);
    }
    async processResult(instrument, result) {
        this.logger.log(`Processing result: Sample=${result.sampleId}, Test=${result.testCode}, Value=${result.value}`);
        const mapping = await this.mappingRepo.findOne({
            where: {
                instrumentId: instrument.id,
                instrumentTestCode: result.testCode,
                isActive: true,
            },
        });
        if (!mapping) {
            this.logger.warn(`No mapping found for instrument test code: ${result.testCode}`);
            return {
                success: false,
                message: `No mapping for test code: ${result.testCode}`,
            };
        }
        const sample = await this.findSample(result.sampleId, instrument.labId);
        if (!sample) {
            this.logger.warn(`Sample not found: ${result.sampleId}`);
            return {
                success: false,
                message: `Sample not found: ${result.sampleId}`,
            };
        }
        const orderTest = await this.orderTestRepo.findOne({
            where: {
                sampleId: sample.id,
                testId: mapping.testId,
            },
            relations: ['test', 'sample', 'sample.order'],
        });
        if (!orderTest) {
            this.logger.warn(`Order test not found for sample ${sample.id} and test ${mapping.testId}`);
            return {
                success: false,
                message: `Order test not found`,
            };
        }
        if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED) {
            this.logger.warn(`Order test ${orderTest.id} is already verified, skipping`);
            return {
                success: false,
                orderTestId: orderTest.id,
                orderId: orderTest.sample?.order?.id,
                message: 'Result already verified',
            };
        }
        const { numericValue, textValue } = this.parseResultValue(result.value, mapping.multiplier);
        const flag = this.hl7Parser.mapFlag(result.flag);
        const previousValue = orderTest.resultValue;
        const isUpdate = orderTest.resultedAt !== null;
        orderTest.resultValue = numericValue;
        orderTest.resultText = textValue;
        orderTest.flag = flag;
        orderTest.status = instrument.autoPost && !instrument.requireVerification
            ? order_test_entity_1.OrderTestStatus.COMPLETED
            : order_test_entity_1.OrderTestStatus.COMPLETED;
        orderTest.resultedAt = new Date();
        orderTest.resultedBy = null;
        if (result.comments.length > 0) {
            const existingComments = orderTest.comments || '';
            const instrumentComments = result.comments.join('\n');
            orderTest.comments = existingComments
                ? `${existingComments}\n[Instrument]: ${instrumentComments}`
                : `[Instrument]: ${instrumentComments}`;
        }
        await this.orderTestRepo.save(orderTest);
        await this.auditService.log({
            labId: instrument.labId,
            userId: null,
            action: isUpdate ? audit_log_entity_1.AuditAction.RESULT_UPDATE : audit_log_entity_1.AuditAction.RESULT_ENTER,
            entityType: 'order_test',
            entityId: orderTest.id,
            oldValues: previousValue !== null ? { resultValue: previousValue } : null,
            newValues: {
                resultValue: numericValue,
                resultText: textValue,
                flag,
                source: 'instrument',
                instrumentCode: instrument.code,
            },
            description: `Result ${isUpdate ? 'updated' : 'received'} from instrument ${instrument.code}`,
        });
        this.logger.log(`Result processed: OrderTest=${orderTest.id}, Value=${numericValue || textValue}`);
        return {
            success: true,
            orderTestId: orderTest.id,
            orderId: orderTest.sample?.order?.id,
            message: 'Result processed successfully',
        };
    }
    async findSample(sampleIdentifier, labId) {
        if (!sampleIdentifier)
            return null;
        let sample = await this.sampleRepo
            .createQueryBuilder('s')
            .innerJoin('s.order', 'o')
            .where('o.labId = :labId', { labId })
            .andWhere('s.sampleId = :sampleId', { sampleId: sampleIdentifier })
            .getOne();
        if (sample)
            return sample;
        sample = await this.sampleRepo
            .createQueryBuilder('s')
            .innerJoin('s.order', 'o')
            .where('o.labId = :labId', { labId })
            .andWhere('s.barcode = :barcode', { barcode: sampleIdentifier })
            .getOne();
        if (sample)
            return sample;
        const order = await this.orderRepo.findOne({
            where: { labId, orderNumber: sampleIdentifier },
            relations: ['samples'],
        });
        if (order && order.samples.length > 0) {
            return order.samples[0];
        }
        sample = await this.sampleRepo
            .createQueryBuilder('s')
            .innerJoin('s.order', 'o')
            .where('o.labId = :labId', { labId })
            .andWhere('s.id = :id', { id: sampleIdentifier })
            .getOne();
        return sample;
    }
    parseResultValue(value, multiplier) {
        if (!value || value.trim() === '') {
            return { numericValue: null, textValue: null };
        }
        const cleanValue = value.replace(/[<>]/g, '').trim();
        const numericValue = parseFloat(cleanValue);
        if (!isNaN(numericValue)) {
            const finalValue = multiplier ? numericValue * multiplier : numericValue;
            return {
                numericValue: Math.round(finalValue * 10000) / 10000,
                textValue: null,
            };
        }
        return {
            numericValue: null,
            textValue: value.trim(),
        };
    }
    async processBatch(instrument, results) {
        let processed = 0;
        let failed = 0;
        const errors = [];
        for (const result of results) {
            try {
                const processedResult = await this.processResult(instrument, result);
                if (processedResult.success) {
                    processed++;
                }
                else {
                    failed++;
                    errors.push(`${result.testCode}: ${processedResult.message}`);
                }
            }
            catch (error) {
                failed++;
                const errorMsg = error instanceof Error ? error.message : 'Unknown error';
                errors.push(`${result.testCode}: ${errorMsg}`);
            }
        }
        return { processed, failed, errors };
    }
};
exports.InstrumentResultProcessor = InstrumentResultProcessor;
exports.InstrumentResultProcessor = InstrumentResultProcessor = InstrumentResultProcessor_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(instrument_entity_1.InstrumentTestMapping)),
    __param(1, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(2, (0, typeorm_1.InjectRepository)(sample_entity_1.Sample)),
    __param(3, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        hl7_parser_service_1.HL7ParserService,
        audit_service_1.AuditService])
], InstrumentResultProcessor);
//# sourceMappingURL=result-processor.service.js.map