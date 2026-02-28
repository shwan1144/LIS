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
var AstmIngestionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AstmIngestionService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const instrument_entity_1 = require("../entities/instrument.entity");
const order_entity_1 = require("../entities/order.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const order_test_result_history_entity_1 = require("../entities/order-test-result-history.entity");
const unmatched_instrument_result_entity_1 = require("../entities/unmatched-instrument-result.entity");
const audit_service_1 = require("../audit/audit.service");
const audit_log_entity_1 = require("../entities/audit-log.entity");
const panel_status_service_1 = require("../panels/panel-status.service");
const astm_parser_service_1 = require("./astm-parser.service");
let AstmIngestionService = AstmIngestionService_1 = class AstmIngestionService {
    constructor(instrumentRepo, mappingRepo, messageRepo, orderTestRepo, historyRepo, unmatchedRepo, orderRepo, astmParser, panelStatusService, auditService) {
        this.instrumentRepo = instrumentRepo;
        this.mappingRepo = mappingRepo;
        this.messageRepo = messageRepo;
        this.orderTestRepo = orderTestRepo;
        this.historyRepo = historyRepo;
        this.unmatchedRepo = unmatchedRepo;
        this.orderRepo = orderRepo;
        this.astmParser = astmParser;
        this.panelStatusService = panelStatusService;
        this.auditService = auditService;
        this.logger = new common_1.Logger(AstmIngestionService_1.name);
    }
    async ingestAstmResult(instrumentId, rawMessage, config) {
        const instrument = await this.instrumentRepo.findOne({ where: { id: instrumentId } });
        if (!instrument) {
            throw new Error(`Instrument ${instrumentId} not found`);
        }
        const strictMode = config?.strictMode !== false;
        let messageRecord;
        try {
            messageRecord = this.messageRepo.create({
                instrumentId,
                direction: 'IN',
                messageType: 'ASTM',
                rawMessage,
                status: 'RECEIVED',
            });
            messageRecord = await this.messageRepo.save(messageRecord);
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            this.logger.error(`Failed to save raw ASTM message: ${errorMsg}`);
            return {
                success: false,
                messageId: '',
                processed: 0,
                unmatched: 0,
                errors: [`Failed to save message: ${errorMsg}`],
                ackCode: 'AE',
                ackMessage: 'Failed to save message',
            };
        }
        let parsed;
        try {
            parsed = this.astmParser.parseMessage(rawMessage);
            messageRecord.messageType = parsed.messageType;
            messageRecord.parsedMessage = {
                protocol: 'ASTM',
                variant: parsed.protocolVariant,
                sender: parsed.sender,
                terminationCode: parsed.terminationCode,
            };
            await this.messageRepo.save(messageRecord);
        }
        catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            messageRecord.status = 'ERROR';
            messageRecord.errorMessage = errorMsg;
            await this.messageRepo.save(messageRecord);
            return {
                success: false,
                messageId: messageRecord.id,
                processed: 0,
                unmatched: 0,
                errors: [`ASTM parse error: ${errorMsg}`],
                ackCode: 'AE',
                ackMessage: errorMsg,
            };
        }
        if (!parsed.results.length) {
            const errorMsg = 'No ASTM result records found';
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
        let processedCount = 0;
        let unmatchedCount = 0;
        const errors = [];
        const processedOrderTestIds = new Set();
        for (const result of parsed.results) {
            try {
                const processed = await this.processResult(instrument, result, messageRecord.id, strictMode);
                if (processed.success && processed.orderTestId) {
                    processedCount += 1;
                    processedOrderTestIds.add(processed.orderTestId);
                }
                else {
                    unmatchedCount += 1;
                    await this.storeUnmatched(instrument, result, processed.reason ?? unmatched_instrument_result_entity_1.UnmatchedReason.NO_MAPPING, messageRecord.id, processed.message);
                }
            }
            catch (err) {
                const errorMsg = err instanceof Error ? err.message : String(err);
                errors.push(`R${result.sequence}: ${errorMsg}`);
                unmatchedCount += 1;
                await this.storeUnmatched(instrument, result, unmatched_instrument_result_entity_1.UnmatchedReason.NO_MAPPING, messageRecord.id, errorMsg);
            }
        }
        if (processedOrderTestIds.size > 0) {
            const tests = await this.orderTestRepo.find({
                where: { id: (0, typeorm_2.In)(Array.from(processedOrderTestIds)) },
            });
            const sampleIds = Array.from(new Set(tests.map((t) => t.sampleId)));
            for (const sampleId of sampleIds) {
                await this.panelStatusService.recomputePanelsForSample(sampleId);
            }
        }
        messageRecord.status = errors.length > 0 ? 'ERROR' : 'PROCESSED';
        messageRecord.errorMessage = errors.length > 0 ? errors.join('; ') : null;
        await this.messageRepo.save(messageRecord);
        const hasHardFailure = processedCount === 0 && unmatchedCount > 0;
        return {
            success: !hasHardFailure && errors.length === 0,
            messageId: messageRecord.id,
            processed: processedCount,
            unmatched: unmatchedCount,
            errors,
            ackCode: hasHardFailure ? 'AE' : 'AA',
            ackMessage: hasHardFailure ? 'No results matched' : undefined,
        };
    }
    async processResult(instrument, result, messageId, strictMode) {
        const sampleIdentifier = (result.sampleId || '').trim();
        if (!sampleIdentifier) {
            return {
                success: false,
                reason: unmatched_instrument_result_entity_1.UnmatchedReason.UNMATCHED_SAMPLE,
                message: 'Order number not found in ASTM order record',
            };
        }
        const sample = await this.findSample(sampleIdentifier, instrument.labId);
        if (!sample) {
            this.logger.warn(JSON.stringify({
                event: 'instrument_order_number_mismatch',
                instrumentId: instrument.id,
                labId: instrument.labId,
                orderNumber: sampleIdentifier,
                source: 'ASTM',
            }));
            return {
                success: false,
                reason: unmatched_instrument_result_entity_1.UnmatchedReason.UNMATCHED_SAMPLE,
                message: `Order number "${sampleIdentifier}" not found in lab`,
            };
        }
        const instrumentCode = (result.testCode || '').trim().toUpperCase();
        if (!instrumentCode) {
            return {
                success: false,
                reason: unmatched_instrument_result_entity_1.UnmatchedReason.NO_MAPPING,
                message: 'Result record is missing test code',
            };
        }
        const mapping = await this.mappingRepo
            .createQueryBuilder('mapping')
            .where('mapping.instrumentId = :instrumentId', { instrumentId: instrument.id })
            .andWhere('UPPER(mapping.instrumentTestCode) = :code', { code: instrumentCode })
            .andWhere('mapping.isActive = true')
            .getOne();
        if (!mapping) {
            return {
                success: false,
                reason: unmatched_instrument_result_entity_1.UnmatchedReason.NO_MAPPING,
                message: `No mapping found for instrument code: ${instrumentCode}`,
            };
        }
        let orderTest = await this.orderTestRepo.findOne({
            where: {
                sampleId: sample.id,
                testId: mapping.testId,
            },
            relations: ['test', 'sample', 'sample.order'],
        });
        if (!orderTest && sample.orderId) {
            orderTest = await this.orderTestRepo
                .createQueryBuilder('ot')
                .leftJoinAndSelect('ot.test', 'test')
                .leftJoinAndSelect('ot.sample', 'sample')
                .leftJoinAndSelect('sample.order', 'order')
                .where('sample.orderId = :orderId', { orderId: sample.orderId })
                .andWhere('ot.testId = :testId', { testId: mapping.testId })
                .orderBy('ot.createdAt', 'ASC')
                .getOne();
        }
        if (!orderTest) {
            return {
                success: false,
                reason: unmatched_instrument_result_entity_1.UnmatchedReason.UNORDERED_TEST,
                message: `Mapped test is not ordered for order ${sample.orderId}`,
            };
        }
        if (orderTest.status === order_test_entity_1.OrderTestStatus.VERIFIED && strictMode) {
            return {
                success: false,
                reason: unmatched_instrument_result_entity_1.UnmatchedReason.DUPLICATE_RESULT,
                message: `Order test ${orderTest.id} already verified`,
            };
        }
        const { numericValue, textValue } = this.parseResultValue(result.value, mapping.multiplier);
        const flag = this.astmParser.mapFlag(result.flag);
        const history = this.historyRepo.create({
            orderTestId: orderTest.id,
            resultValue: numericValue,
            resultText: textValue,
            unit: result.unit || null,
            flag,
            referenceRange: result.referenceRange || null,
            receivedAt: new Date(),
            messageId,
            obxSetId: String(result.sequence),
            obxSequence: result.sequence,
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
        orderTest.status = order_test_entity_1.OrderTestStatus.COMPLETED;
        orderTest.resultedAt = new Date();
        orderTest.resultedBy = null;
        if (result.comments.length > 0) {
            const existingComments = orderTest.comments || '';
            const incoming = result.comments.join('\n');
            orderTest.comments = existingComments
                ? `${existingComments}\n[Instrument ${instrument.code}]: ${incoming}`
                : `[Instrument ${instrument.code}]: ${incoming}`;
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
                source: 'astm',
                instrumentCode: instrument.code,
                messageId,
            },
            description: `Result ${isUpdate ? 'updated' : 'received'} from instrument ${instrument.code} (ASTM)`,
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
    async storeUnmatched(instrument, result, reason, messageId, details) {
        const { numericValue, textValue } = this.parseResultValue(result.value, null);
        const unmatched = this.unmatchedRepo.create({
            instrumentId: instrument.id,
            sampleIdentifier: result.sampleId || '',
            instrumentCode: (result.testCode || '').trim(),
            instrumentTestName: result.testName || null,
            resultValue: numericValue,
            resultText: textValue,
            unit: result.unit || null,
            flag: this.astmParser.mapFlag(result.flag),
            referenceRange: result.referenceRange || null,
            reason,
            details,
            rawMessageId: messageId,
            receivedAt: new Date(),
            status: 'PENDING',
        });
        await this.unmatchedRepo.save(unmatched);
    }
    async findSample(orderNumber, labId) {
        if (!orderNumber)
            return null;
        const order = await this.orderRepo.findOne({
            where: { labId, orderNumber },
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
        const numericValue = Number.parseFloat(cleanValue);
        if (!Number.isNaN(numericValue)) {
            const finalValue = multiplier ? numericValue * Number(multiplier) : numericValue;
            return { numericValue: finalValue, textValue: null };
        }
        return { numericValue: null, textValue: cleanValue };
    }
};
exports.AstmIngestionService = AstmIngestionService;
exports.AstmIngestionService = AstmIngestionService = AstmIngestionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(instrument_entity_1.Instrument)),
    __param(1, (0, typeorm_1.InjectRepository)(instrument_entity_1.InstrumentTestMapping)),
    __param(2, (0, typeorm_1.InjectRepository)(instrument_entity_1.InstrumentMessage)),
    __param(3, (0, typeorm_1.InjectRepository)(order_test_entity_1.OrderTest)),
    __param(4, (0, typeorm_1.InjectRepository)(order_test_result_history_entity_1.OrderTestResultHistory)),
    __param(5, (0, typeorm_1.InjectRepository)(unmatched_instrument_result_entity_1.UnmatchedInstrumentResult)),
    __param(6, (0, typeorm_1.InjectRepository)(order_entity_1.Order)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        typeorm_2.Repository,
        astm_parser_service_1.AstmParserService,
        panel_status_service_1.PanelStatusService,
        audit_service_1.AuditService])
], AstmIngestionService);
//# sourceMappingURL=astm-ingestion.service.js.map