import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Instrument, InstrumentMessage, InstrumentTestMapping } from '../entities/instrument.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { OrderTest, OrderTestStatus, ResultFlag } from '../entities/order-test.entity';
import { OrderTestResultHistory } from '../entities/order-test-result-history.entity';
import { Sample } from '../entities/sample.entity';
import { UnmatchedInstrumentResult, UnmatchedReason } from '../entities/unmatched-instrument-result.entity';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';
import { PanelStatusService } from '../panels/panel-status.service';
import { AstmParserService, AstmResult } from './astm-parser.service';

export interface AstmIngestionResult {
  success: boolean;
  messageId: string;
  processed: number;
  unmatched: number;
  errors: string[];
  ackCode: 'AA' | 'AE' | 'AR';
  ackMessage?: string;
}

@Injectable()
export class AstmIngestionService {
  private readonly logger = new Logger(AstmIngestionService.name);

  constructor(
    @InjectRepository(Instrument)
    private readonly instrumentRepo: Repository<Instrument>,
    @InjectRepository(InstrumentTestMapping)
    private readonly mappingRepo: Repository<InstrumentTestMapping>,
    @InjectRepository(InstrumentMessage)
    private readonly messageRepo: Repository<InstrumentMessage>,
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    @InjectRepository(OrderTestResultHistory)
    private readonly historyRepo: Repository<OrderTestResultHistory>,
    @InjectRepository(UnmatchedInstrumentResult)
    private readonly unmatchedRepo: Repository<UnmatchedInstrumentResult>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly astmParser: AstmParserService,
    private readonly panelStatusService: PanelStatusService,
    private readonly auditService: AuditService,
  ) {}

  async ingestAstmResult(
    instrumentId: string,
    rawMessage: string,
    config?: {
      strictMode?: boolean;
    },
  ): Promise<AstmIngestionResult> {
    const instrument = await this.instrumentRepo.findOne({ where: { id: instrumentId } });
    if (!instrument) {
      throw new Error(`Instrument ${instrumentId} not found`);
    }

    const strictMode = config?.strictMode !== false;

    let messageRecord: InstrumentMessage;
    try {
      messageRecord = this.messageRepo.create({
        instrumentId,
        direction: 'IN',
        messageType: 'ASTM',
        rawMessage,
        status: 'RECEIVED',
      });
      messageRecord = await this.messageRepo.save(messageRecord);
    } catch (err) {
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
    } catch (err) {
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
    const errors: string[] = [];
    const processedOrderTestIds = new Set<string>();

    for (const result of parsed.results) {
      try {
        const processed = await this.processResult(
          instrument,
          result,
          messageRecord.id,
          strictMode,
        );

        if (processed.success && processed.orderTestId) {
          processedCount += 1;
          processedOrderTestIds.add(processed.orderTestId);
        } else {
          unmatchedCount += 1;
          await this.storeUnmatched(
            instrument,
            result,
            processed.reason ?? UnmatchedReason.NO_MAPPING,
            messageRecord.id,
            processed.message,
          );
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`R${result.sequence}: ${errorMsg}`);
        unmatchedCount += 1;
        await this.storeUnmatched(
          instrument,
          result,
          UnmatchedReason.NO_MAPPING,
          messageRecord.id,
          errorMsg,
        );
      }
    }

    if (processedOrderTestIds.size > 0) {
      const tests = await this.orderTestRepo.find({
        where: { id: In(Array.from(processedOrderTestIds)) },
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

  private async processResult(
    instrument: Instrument,
    result: AstmResult,
    messageId: string,
    strictMode: boolean,
  ): Promise<{
    success: boolean;
    orderTestId?: string;
    reason?: UnmatchedReason;
    message: string;
  }> {
    const sampleIdentifier = (result.sampleId || '').trim();
    if (!sampleIdentifier) {
      return {
        success: false,
        reason: UnmatchedReason.UNMATCHED_SAMPLE,
        message: 'Order number not found in ASTM order record',
      };
    }

    const sample = await this.findSample(sampleIdentifier, instrument.labId);
    if (!sample) {
      this.logger.warn(
        JSON.stringify({
          event: 'instrument_order_number_mismatch',
          instrumentId: instrument.id,
          labId: instrument.labId,
          orderNumber: sampleIdentifier,
          source: 'ASTM',
        }),
      );
      return {
        success: false,
        reason: UnmatchedReason.UNMATCHED_SAMPLE,
        message: `Order number "${sampleIdentifier}" not found in lab`,
      };
    }

    const instrumentCode = (result.testCode || '').trim().toUpperCase();
    if (!instrumentCode) {
      return {
        success: false,
        reason: UnmatchedReason.NO_MAPPING,
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
        reason: UnmatchedReason.NO_MAPPING,
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

    // If not found on the first sample resolved by order number, fallback to sibling samples.
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
        reason: UnmatchedReason.UNORDERED_TEST,
        message: `Mapped test is not ordered for order ${sample.orderId}`,
      };
    }

    if (orderTest.status === OrderTestStatus.VERIFIED && strictMode) {
      return {
        success: false,
        reason: UnmatchedReason.DUPLICATE_RESULT,
        message: `Order test ${orderTest.id} already verified`,
      };
    }

    const { numericValue, textValue } = this.parseResultValue(result.value, mapping.multiplier);
    const flag = this.astmParser.mapFlag(result.flag) as ResultFlag | null;

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
    orderTest.status = OrderTestStatus.COMPLETED;
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
      action: isUpdate ? AuditAction.RESULT_UPDATE : AuditAction.RESULT_ENTER,
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

  private async storeUnmatched(
    instrument: Instrument,
    result: AstmResult,
    reason: UnmatchedReason,
    messageId: string,
    details: string,
  ): Promise<void> {
    const { numericValue, textValue } = this.parseResultValue(result.value, null);
    const unmatched = this.unmatchedRepo.create({
      instrumentId: instrument.id,
      sampleIdentifier: result.sampleId || '',
      instrumentCode: (result.testCode || '').trim(),
      instrumentTestName: result.testName || null,
      resultValue: numericValue,
      resultText: textValue,
      unit: result.unit || null,
      flag: this.astmParser.mapFlag(result.flag) as ResultFlag | null,
      referenceRange: result.referenceRange || null,
      reason,
      details,
      rawMessageId: messageId,
      receivedAt: new Date(),
      status: 'PENDING',
    });
    await this.unmatchedRepo.save(unmatched);
  }

  private async findSample(orderNumber: string, labId: string): Promise<Sample | null> {
    if (!orderNumber) return null;

    // Order-number-only resolution (legacy sampleId/barcode matching removed).
    const order = await this.orderRepo.findOne({
      where: { labId, orderNumber },
      relations: ['samples'],
    });
    if (order && order.samples.length > 0 && order.status !== OrderStatus.CANCELLED) {
      return order.samples[0];
    }

    return null;
  }

  private parseResultValue(
    value: string,
    multiplier: number | null,
  ): { numericValue: number | null; textValue: string | null } {
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
}
