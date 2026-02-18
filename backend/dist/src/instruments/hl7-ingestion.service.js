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
var HL7IngestionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HL7IngestionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const instrument_entity_1 = require("../entities/instrument.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const order_test_result_history_entity_1 = require("../entities/order-test-result-history.entity");
const unmatched_instrument_result_entity_1 = require("../entities/unmatched-instrument-result.entity");
const sample_entity_1 = require("../entities/sample.entity");
const order_entity_1 = require("../entities/order.entity");
const hl7_parser_service_1 = require("./hl7-parser.service");
const panel_status_service_1 = require("../panels/panel-status.service");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
let HL7IngestionService = HL7IngestionService_1 = class HL7IngestionService {
    constructor(instrumentRepo, mappingRepo, messageRepo, orderTestRepo, historyRepo, unmatchedRepo, sampleRepo, orderRepo, hl7Parser, panelStatusService, auditService) {
        this.instrumentRepo = instrumentRepo;
        this.mappingRepo = mappingRepo;
        this.messageRepo = messageRepo;
        this.orderTestRepo = orderTestRepo;
        this.historyRepo = historyRepo;
        this.unmatchedRepo = unmatchedRepo;
        this.sampleRepo = sampleRepo;
        this.orderRepo = orderRepo;
        this.hl7Parser = hl7Parser;
        this.panelStatusService = panelStatusService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(HL7IngestionService_1.name);
    }
    async ingestHL7Oru(instrumentId, rawMessage, config) {
        const instrument = await this.instrumentRepo.findOne({ where: { id: instrumentId } });
        if (!instrument) {
            throw new Error(`Instrument ${instrumentId} not found`);
        }
        const sampleField = config?.sampleIdentifierField || 'OBR-3';
        const strictMode = config?.strictMode !== false;
        let messageRecord;
        try {
            messageRecord = this.messageRepo.create({
                instrumentId,
                direction: 'IN',
                messageType: 'ORU',
                rawMessage,
                status: 'RECEIVED',
            });
            messageRecord = await this.messageRepo.save(messageRecord);
        }
        catch (err) {
            this.logger.error(`Failed to save raw message: ${err}`);
            return {
                success: false,
                messageId: '',
                processed: 0,
                unmatched: 0,
                errors: [`Failed to save message: ${err instanceof Error ? err.message : String(err)}`],
                ackCode: 'AE',
                ackMessage: 'Failed to save message',
            };
        }
        let parsed;
        try {
            parsed = this.hl7Parser.parseORU(rawMessage);
            messageRecord.messageControlId = parsed.message.messageControlId;
            messageRecord.parsedMessage = {
                sendingApp: parsed.message.sendingApplication,
                sendingFacility: parsed.message.sendingFacility,
                dateTime: parsed.message.dateTime,
                version: parsed.message.version,
            };
            await this.messageRepo.save(messageRecord);
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to parse HL7: ${errorMsg}`);
            messageRecord.status = 'ERROR';
            messageRecord.errorMessage = errorMsg;
            await this.messageRepo.save(messageRecord);
            return {
                success: false,
                messageId: messageRecord.id,
                processed: 0,
                unmatched: 0,
                errors: [`Parse error: ${errorMsg}`],
                ackCode: 'AE',
                ackMessage: errorMsg,
            };
        }
        const obrSegment = parsed.message.segments.find(s => s.name === 'OBR');
        if (!obrSegment) {
            const errorMsg = 'OBR segment not found';
            messageRecord.status = 'ERROR';
            messageRecord.errorMessage = errorMsg;
            await this.messageRepo.save(messageRecord);
            return {
                success: false,
                messageId: messageRecord.id,
                processed: 0,
                unmatched: 0,
                errors: [errorMsg],
                ackCode: 'AE',
                ackMessage: errorMsg,
            };
        }
        let sampleIdentifier = null;
        if (sampleField === 'OBR-3') {
            sampleIdentifier = this.hl7Parser.getField(obrSegment, 3, 0) || null;
        }
        else if (sampleField === 'OBR-2') {
            sampleIdentifier = this.hl7Parser.getField(obrSegment, 2, 0) || null;
        }
        else if (sampleField === 'PID-3') {
            const pidSegment = parsed.message.segments.find(s => s.name === 'PID');
            if (pidSegment) {
                sampleIdentifier = this.hl7Parser.getField(pidSegment, 3, 0) || null;
            }
        }
        if (!sampleIdentifier) {
            const errorMsg = `Sample identifier not found in ${sampleField}`;
            messageRecord.status = 'ERROR';
            messageRecord.errorMessage = errorMsg;
            await this.messageRepo.save(messageRecord);
            return {
                success: false,
                messageId: messageRecord.id,
                processed: 0,
                unmatched: 0,
                errors: [errorMsg],
                ackCode: 'AE',
                ackMessage: errorMsg,
            };
        }
        const sample = await this.findSample(sampleIdentifier.trim(), instrument.labId);
        if (!sample) {
            const unmatchedCount = parsed.results.length;
            for (const result of parsed.results) {
                await this.storeUnmatched(instrument, sampleIdentifier.trim(), result, unmatched_instrument_result_entity_1.UnmatchedReason.UNMATCHED_SAMPLE, messageRecord.id, `Sample identifier "${sampleIdentifier}" not found in lab ${instrument.labId}`);
            }
            messageRecord.status = 'ERROR';
            messageRecord.errorMessage = `Sample not found: ${sampleIdentifier}`;
            await this.messageRepo.save(messageRecord);
            return {
                success: false,
                messageId: messageRecord.id,
                processed: 0,
                unmatched: unmatchedCount,
                errors: [`Sample not found: ${sampleIdentifier}`],
                ackCode: 'AE',
                ackMessage: `Sample ${sampleIdentifier} not found`,
            };
        }
        let processedCount = 0;
        let unmatchedCount = 0;
        const errors = [];
        const processedOrderTestIds = new Set();
        for (let i = 0; i < parsed.results.length; i++) {
            const result = parsed.results[i];
            try {
                const processResult = await this.processOBXResult(instrument, sample, result, messageRecord.id, i + 1, strictMode);
                if (processResult.success && processResult.orderTestId) {
                    processedCount++;
                    processedOrderTestIds.add(processResult.orderTestId);
                }
                else {
                    unmatchedCount++;
                    if (processResult.reason) {
                        await this.storeUnmatched(instrument, sampleIdentifier.trim(), result, processResult.reason, messageRecord.id, processResult.message);
                    }
                }
            }
            catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                errors.push(`OBX ${i + 1}: ${errorMsg}`);
                unmatchedCount++;
                await this.storeUnmatched(instrument, sampleIdentifier.trim(), result, unmatched_instrument_result_entity_1.UnmatchedReason.NO_MAPPING, messageRecord.id, errorMsg);
            }
        }
        if (processedOrderTestIds.size > 0) {
            const orderTests = await this.orderTestRepo.find({
                where: { id: (0, typeorm_2.In)(Array.from(processedOrderTestIds)) },
                relations: ['sample'],
            });
            const sampleIds = new Set(orderTests.map(ot => ot.sampleId));
            for (const sid of sampleIds) {
                await this.panelStatusService.recomputePanelsForSample(sid);
            }
        }
        messageRecord.status = errors.length > 0 ? 'ERROR' : 'PROCESSED';
        if (errors.length > 0) {
            messageRecord.errorMessage = errors.join('; ');
        }
        await this.messageRepo.save(messageRecord);
        const ackCode = errors.length > 0 ? 'AE' : processedCount > 0 ? 'AA' : 'AR';
        return {
            success: ackCode === 'AA',
            messageId: messageRecord.id,
            processed: processedCount,
            unmatched: unmatchedCount,
            errors,
            ackCode,
            ackMessage: errors.length > 0 ? errors.join('; ') : undefined,
        };
    }
    async processOBXResult(instrument, sample, result, messageId, obxSequence, strictMode) {
        const instrumentCode = result.testCode.trim().toUpperCase();
        const mapping = await this.mappingRepo.findOne({
            where: {
                instrumentId: instrument.id,
                instrumentTestCode: instrumentCode,
                isActive: true,
            },
            relations: ['test'],
        });
        if (!mapping) {
            return {
                success: false,
                reason: unmatched_instrument_result_entity_1.UnmatchedReason.NO_MAPPING,
                message: `No mapping found for instrument code: ${instrumentCode}`,
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
            return {
                success: false,
                reason: unmatched_instrument_result_entity_1.UnmatchedReason.UNORDERED_TEST,
                message: `Test ${mapping.instrumentTestCode || mapping.instrumentTestName || mapping.testId} not ordered for sample ${sample.id}`,
            };
        }
        if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED && strictMode) {
            return {
                success: false,
                reason: unmatched_instrument_result_entity_1.UnmatchedReason.DUPLICATE_RESULT,
                message: `OrderTest ${orderTest.id} already verified`,
            };
        }
        const { numericValue, textValue } = this.parseResultValue(result.value, mapping.multiplier);
        const flag = this.hl7Parser.mapFlag(result.flag);
        const history = this.historyRepo.create({
            orderTestId: orderTest.id,
            resultValue: numericValue,
            resultText: textValue,
            unit: result.unit || null,
            flag,
            referenceRange: result.referenceRange || null,
            receivedAt: new Date(),
            messageId,
            obxSetId: String(obxSequence),
            obxSequence,
            instrumentCode,
            comments: result.comments.length > 0 ? result.comments.join('\n') : null,
        });
        await this.historyRepo.save(history);
        const previousValue = orderTest.resultValue;
        const previousText = orderTest.resultText;
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
                ? `${existingComments}\n[Instrument ${instrument.code}]: ${instrumentComments}`
                : `[Instrument ${instrument.code}]: ${instrumentComments}`;
        }
        await this.orderTestRepo.save(orderTest);
        await this.auditService.log({
            labId: instrument.labId,
            userId: null,
            action: isUpdate ? audit_log_entity_1.AuditAction.RESULT_UPDATE : audit_log_entity_1.AuditAction.RESULT_ENTER,
            entityType: 'order_test',
            entityId: orderTest.id,
            oldValues: previousValue !== null || previousText !== null
                ? { resultValue: previousValue, resultText: previousText }
                : null,
            newValues: {
                resultValue: numericValue,
                resultText: textValue,
                flag,
                source: 'instrument',
                instrumentCode: instrument.code,
                messageId,
            },
            description: `Result ${isUpdate ? 'updated' : 'received'} from instrument ${instrument.code}`,
        });
        if (orderTest.parentOrderTestId) {
            await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
        }
        return {
            success: true,
            orderTestId: orderTest.id,
            message: 'Result processed successfully',
        };
    }
    async storeUnmatched(instrument, sampleIdentifier, result, reason, messageId, details) {
        const unmatched = this.unmatchedRepo.create({
            instrumentId: instrument.id,
            sampleIdentifier,
            instrumentCode: result.testCode.trim(),
            instrumentTestName: result.testName || null,
            resultValue: this.parseResultValue(result.value, null).numericValue,
            resultText: this.parseResultValue(result.value, null).textValue,
            unit: result.unit || null,
            flag: this.hl7Parser.mapFlag(result.flag),
            referenceRange: result.referenceRange || null,
            reason,
            details,
            rawMessageId: messageId,
            receivedAt: new Date(),
            status: 'PENDING',
        });
        await this.unmatchedRepo.save(unmatched);
        this.logger.warn(`Unmatched result stored: ${reason} - ${details}`);
    }
    async findSample(sampleIdentifier, labId) {
        if (!sampleIdentifier)
            return null;
        let sample = await this.sampleRepo
            .createQueryBuilder('s')
            .innerJoin('s.order', 'o')
            .where('o.labId = :labId', { labId })
            .andWhere('s.sampleId = :sampleId', { sampleId: sampleIdentifier })
            .andWhere('o.status != :cancelled', { cancelled: order_entity_1.OrderStatus.CANCELLED })
            .getOne();
        if (sample)
            return sample;
        sample = await this.sampleRepo
            .createQueryBuilder('s')
            .innerJoin('s.order', 'o')
            .where('o.labId = :labId', { labId })
            .andWhere('s.barcode = :barcode', { barcode: sampleIdentifier })
            .andWhere('o.status != :cancelled', { cancelled: order_entity_1.OrderStatus.CANCELLED })
            .getOne();
        if (sample)
            return sample;
        const order = await this.orderRepo.findOne({
            where: { labId, orderNumber: sampleIdentifier },
            relations: ['samples'],
        });
        if (order && order.samples.length > 0 && order.status !== order_entity_1.OrderStatus.CANCELLED) {
            return order.samples[0];
        }
        return null;
    }
    parseResultValue(value, multiplier) {
        if (!value || value.trim() === '') {
            return { numericValue: null, textValue: null };
        }
        const cleanValue = value.replace(/[<>]/g, '').trim();
        const numericValue = parseFloat(cleanValue);
        if (!isNaN(numericValue)) {
            const finalValue = multiplier ? numericValue * multiplier : numericValue;
            return { numericValue: finalValue, textValue: null };
        }
        return { numericValue: null, textValue: cleanValue };
    }
};
exports.HL7IngestionService = HL7IngestionService;
exports.HL7IngestionService = HL7IngestionService = HL7IngestionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(instrument_entity_1.Instrument)),
    __param(1, (0, typeorm_1.InjectRepository)(instrument_entity_1.InstrumentTestMapping)),
    __param(2, (0, typeorm_1.InjectRepository)(instrument_entity_1.InstrumentMessage)),
    __param(3, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(4, (0, typeorm_1.InjectRepository)(order_test_result_history_entity_1.OrderTestResultHistory)),
    __param(5, (0, typeorm_1.InjectRepository)(unmatched_instrument_result_entity_1.UnmatchedInstrumentResult)),
    __param(6, (0, typeorm_1.InjectRepository)(sample_entity_1.Sample)),
    __param(7, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        hl7_parser_service_1.HL7ParserService,
        panel_status_service_1.PanelStatusService,
        audit_service_1.AuditService])
], HL7IngestionService);
//# sourceMappingURL=hl7-ingestion.service.js.map