import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Instrument, InstrumentTestMapping, InstrumentMessage } from '../entities/instrument.entity';
import { OrderTest, OrderTestStatus, ResultFlag } from '../entities/order-test.entity';
import { OrderTestResultHistory } from '../entities/order-test-result-history.entity';
import { UnmatchedInstrumentResult, UnmatchedReason } from '../entities/unmatched-instrument-result.entity';
import { Sample } from '../entities/sample.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { HL7ParserService, ParsedORU, HL7Result } from './hl7-parser.service';
import { PanelStatusService } from '../panels/panel-status.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';

export interface IngestionResult {
  success: boolean;
  messageId: string;
  processed: number;
  unmatched: number;
  errors: string[];
  ackCode: 'AA' | 'AE' | 'AR';
  ackMessage?: string;
}

/**
 * Strict HL7 ORU ingestion service
 * 
 * Key principles:
 * - NEVER auto-create OrderTests from incoming results
 * - STRICT matching: sampleId + testId must exist
 * - Unmatched results go to inbox for manual review
 * - Track result history for reruns/corrections
 * - Recompute panel parent statuses after processing
 */
@Injectable()
export class HL7IngestionService {
  private readonly logger = new Logger(HL7IngestionService.name);

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
    @InjectRepository(Sample)
    private readonly sampleRepo: Repository<Sample>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly hl7Parser: HL7ParserService,
    private readonly panelStatusService: PanelStatusService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Ingest HL7 ORU message with strict matching
   */
  async ingestHL7Oru(
    instrumentId: string,
    rawMessage: string,
    config?: {
      sampleIdentifierField?: 'OBR-3' | 'OBR-2' | 'PID-3'; // Which HL7 field to use as barcode
      strictMode?: boolean; // Default true
    },
  ): Promise<IngestionResult> {
    const instrument = await this.instrumentRepo.findOne({ where: { id: instrumentId } });
    if (!instrument) {
      throw new Error(`Instrument ${instrumentId} not found`);
    }

    const sampleField = config?.sampleIdentifierField || 'OBR-3';
    const strictMode = config?.strictMode !== false; // Default true

    // 1. Store raw message
    let messageRecord: InstrumentMessage;
    try {
      messageRecord = this.messageRepo.create({
        instrumentId,
        direction: 'IN',
        messageType: 'ORU',
        rawMessage,
        status: 'RECEIVED',
      });
      messageRecord = await this.messageRepo.save(messageRecord);
    } catch (err) {
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

    // 2. Parse HL7
    let parsed: ParsedORU;
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
    } catch (err) {
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

    // 3. Extract sample identifier from OBR
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

    let sampleIdentifier: string | null = null;
    if (sampleField === 'OBR-3') {
      sampleIdentifier = this.hl7Parser.getField(obrSegment, 3, 0) || null;
    } else if (sampleField === 'OBR-2') {
      sampleIdentifier = this.hl7Parser.getField(obrSegment, 2, 0) || null;
    } else if (sampleField === 'PID-3') {
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

    // 4. Find sample by identifier
    const sample = await this.findSample(sampleIdentifier.trim(), instrument.labId);
    if (!sample) {
      // Store all OBX as unmatched
      const unmatchedCount = parsed.results.length;
      for (const result of parsed.results) {
        await this.storeUnmatched(
          instrument,
          sampleIdentifier.trim(),
          result,
          UnmatchedReason.UNMATCHED_SAMPLE,
          messageRecord.id,
          `Sample identifier "${sampleIdentifier}" not found in lab ${instrument.labId}`,
        );
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

    // 5. Process each OBX result
    let processedCount = 0;
    let unmatchedCount = 0;
    const errors: string[] = [];
    const processedOrderTestIds = new Set<string>();

    for (let i = 0; i < parsed.results.length; i++) {
      const result = parsed.results[i];
      try {
        const processResult = await this.processOBXResult(
          instrument,
          sample,
          result,
          messageRecord.id,
          i + 1, // OBX sequence
          strictMode,
        );

        if (processResult.success && processResult.orderTestId) {
          processedCount++;
          processedOrderTestIds.add(processResult.orderTestId);
        } else {
          unmatchedCount++;
          if (processResult.reason) {
            await this.storeUnmatched(
              instrument,
              sampleIdentifier.trim(),
              result,
              processResult.reason,
              messageRecord.id,
              processResult.message,
            );
          }
        }
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        errors.push(`OBX ${i + 1}: ${errorMsg}`);
        unmatchedCount++;
        await this.storeUnmatched(
          instrument,
          sampleIdentifier.trim(),
          result,
          UnmatchedReason.NO_MAPPING,
          messageRecord.id,
          errorMsg,
        );
      }
    }

    // 6. Recompute panel parent statuses for affected samples
    if (processedOrderTestIds.size > 0) {
      const orderTests = await this.orderTestRepo.find({
        where: { id: In(Array.from(processedOrderTestIds)) },
        relations: ['sample'],
      });

      const sampleIds = new Set(orderTests.map(ot => ot.sampleId));
      for (const sid of sampleIds) {
        await this.panelStatusService.recomputePanelsForSample(sid);
      }
    }

    // 7. Update message status
    messageRecord.status = errors.length > 0 ? 'ERROR' : 'PROCESSED';
    if (errors.length > 0) {
      messageRecord.errorMessage = errors.join('; ');
    }
    await this.messageRepo.save(messageRecord);

    // 8. Determine ACK code
    const ackCode: 'AA' | 'AE' | 'AR' =
      errors.length > 0 ? 'AE' : processedCount > 0 ? 'AA' : 'AR';

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

  /**
   * Process a single OBX result with strict matching
   */
  private async processOBXResult(
    instrument: Instrument,
    sample: Sample,
    result: HL7Result,
    messageId: string,
    obxSequence: number,
    strictMode: boolean,
  ): Promise<{
    success: boolean;
    orderTestId?: string;
    reason?: UnmatchedReason;
    message: string;
  }> {
    // Normalize instrument code
    const instrumentCode = result.testCode.trim().toUpperCase();

    // Find mapping
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
        reason: UnmatchedReason.NO_MAPPING,
        message: `No mapping found for instrument code: ${instrumentCode}`,
      };
    }

    // STRICT: Find existing OrderTest
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
        reason: UnmatchedReason.UNORDERED_TEST,
        message: `Test ${mapping.instrumentTestCode || mapping.instrumentTestName || mapping.testId} not ordered for sample ${sample.id}`,
      };
    }

    // Check if already verified (optional: allow override in strict mode)
    if (orderTest.status === OrderTestStatus.VERIFIED && strictMode) {
      return {
        success: false,
        reason: UnmatchedReason.DUPLICATE_RESULT,
        message: `OrderTest ${orderTest.id} already verified`,
      };
    }

    // Parse result value
    const { numericValue, textValue } = this.parseResultValue(result.value, mapping.multiplier);
    const flag = this.hl7Parser.mapFlag(result.flag) as ResultFlag | null;

    // Store history
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

    // Update OrderTest current values
    const previousValue = orderTest.resultValue;
    const previousText = orderTest.resultText;
    const isUpdate = orderTest.resultedAt !== null;

    orderTest.resultValue = numericValue;
    orderTest.resultText = textValue;
    orderTest.flag = flag;
    orderTest.status = instrument.autoPost && !instrument.requireVerification
      ? OrderTestStatus.COMPLETED
      : OrderTestStatus.COMPLETED; // Always set to completed; verification is separate
    orderTest.resultedAt = new Date();
    orderTest.resultedBy = null; // Instrument source

    if (result.comments.length > 0) {
      const existingComments = orderTest.comments || '';
      const instrumentComments = result.comments.join('\n');
      orderTest.comments = existingComments
        ? `${existingComments}\n[Instrument ${instrument.code}]: ${instrumentComments}`
        : `[Instrument ${instrument.code}]: ${instrumentComments}`;
    }

    await this.orderTestRepo.save(orderTest);

    // Audit log
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
        source: 'instrument',
        instrumentCode: instrument.code,
        messageId,
      },
      description: `Result ${isUpdate ? 'updated' : 'received'} from instrument ${instrument.code}`,
    });

    // Recompute parent panel if this is a child
    if (orderTest.parentOrderTestId) {
      await this.panelStatusService.recomputeAfterChildUpdate(orderTest.id);
    }

    return {
      success: true,
      orderTestId: orderTest.id,
      message: 'Result processed successfully',
    };
  }

  /**
   * Store unmatched result in inbox
   */
  private async storeUnmatched(
    instrument: Instrument,
    sampleIdentifier: string,
    result: HL7Result,
    reason: UnmatchedReason,
    messageId: string,
    details: string,
  ): Promise<void> {
    const unmatched = this.unmatchedRepo.create({
      instrumentId: instrument.id,
      sampleIdentifier,
      instrumentCode: result.testCode.trim(),
      instrumentTestName: result.testName || null,
      resultValue: this.parseResultValue(result.value, null).numericValue,
      resultText: this.parseResultValue(result.value, null).textValue,
      unit: result.unit || null,
      flag: this.hl7Parser.mapFlag(result.flag) as ResultFlag | null,
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

  /**
   * Find sample by various identifiers
   */
  private async findSample(sampleIdentifier: string, labId: string): Promise<Sample | null> {
    if (!sampleIdentifier) return null;

    // Try by sampleId field
    let sample = await this.sampleRepo
      .createQueryBuilder('s')
      .innerJoin('s.order', 'o')
      .where('o.labId = :labId', { labId })
      .andWhere('s.sampleId = :sampleId', { sampleId: sampleIdentifier })
      .andWhere('o.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .getOne();

    if (sample) return sample;

    // Try by barcode
    sample = await this.sampleRepo
      .createQueryBuilder('s')
      .innerJoin('s.order', 'o')
      .where('o.labId = :labId', { labId })
      .andWhere('s.barcode = :barcode', { barcode: sampleIdentifier })
      .andWhere('o.status != :cancelled', { cancelled: OrderStatus.CANCELLED })
      .getOne();

    if (sample) return sample;

    // Try by order number
    const order = await this.orderRepo.findOne({
      where: { labId, orderNumber: sampleIdentifier },
      relations: ['samples'],
    });

    if (order && order.samples.length > 0 && order.status !== OrderStatus.CANCELLED) {
      return order.samples[0];
    }

    return null;
  }

  /**
   * Parse result value and apply multiplier
   */
  private parseResultValue(
    value: string,
    multiplier: number | null,
  ): { numericValue: number | null; textValue: string | null } {
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
}
