import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Instrument, InstrumentTestMapping } from '../entities/instrument.entity';
import { OrderTest, OrderTestStatus, ResultFlag } from '../entities/order-test.entity';
import { Sample } from '../entities/sample.entity';
import { Order, OrderStatus } from '../entities/order.entity';
import { HL7ParserService, HL7Result } from './hl7-parser.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '../entities/audit-log.entity';

export interface ProcessedResult {
  success: boolean;
  orderTestId?: string;
  orderId?: string;
  message: string;
}

@Injectable()
export class InstrumentResultProcessor {
  private readonly logger = new Logger(InstrumentResultProcessor.name);

  constructor(
    @InjectRepository(InstrumentTestMapping)
    private readonly mappingRepo: Repository<InstrumentTestMapping>,
    @InjectRepository(OrderTest)
    private readonly orderTestRepo: Repository<OrderTest>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly hl7Parser: HL7ParserService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Process a single result from instrument
   */
  async processResult(instrument: Instrument, result: HL7Result): Promise<ProcessedResult> {
    this.logger.log(`Processing result: Identifier=${result.sampleId}, Test=${result.testCode}, Value=${result.value}`);

    // Find test mapping
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

    // Find the sample by various identifiers
    const sample = await this.findSample(result.sampleId, instrument.labId);
    if (!sample) {
      this.logger.warn(
        JSON.stringify({
          event: 'instrument_order_number_mismatch',
          instrumentId: instrument.id,
          labId: instrument.labId,
          orderNumber: result.sampleId,
          source: 'RESULT_PROCESSOR',
        }),
      );
      this.logger.warn(`Order number not found: ${result.sampleId}`);
      return {
        success: false,
        message: `Order number not found: ${result.sampleId}`,
      };
    }

    // Find the order test
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
      this.logger.warn(`Order test not found for order ${sample.orderId} and test ${mapping.testId}`);
      return {
        success: false,
        message: `Order test not found`,
      };
    }

    // Check if already verified
    if (orderTest.status === OrderTestStatus.VERIFIED) {
      this.logger.warn(`Order test ${orderTest.id} is already verified, skipping`);
      return {
        success: false,
        orderTestId: orderTest.id,
        orderId: orderTest.sample?.order?.id,
        message: 'Result already verified',
      };
    }

    // Parse and convert result value
    const { numericValue, textValue } = this.parseResultValue(result.value, mapping.multiplier);

    // Map the flag
    const flag = this.hl7Parser.mapFlag(result.flag) as ResultFlag | null;

    // Update the order test
    const previousValue = orderTest.resultValue;
    const isUpdate = orderTest.resultedAt !== null;

    orderTest.resultValue = numericValue;
    orderTest.resultText = textValue;
    orderTest.flag = flag;
    orderTest.status = instrument.autoPost && !instrument.requireVerification
      ? OrderTestStatus.COMPLETED
      : OrderTestStatus.COMPLETED; // Always set to completed, verification happens separately
    orderTest.resultedAt = new Date();
    orderTest.resultedBy = null; // Indicate it came from instrument

    // Add comments if any
    if (result.comments.length > 0) {
      const existingComments = orderTest.comments || '';
      const instrumentComments = result.comments.join('\n');
      orderTest.comments = existingComments
        ? `${existingComments}\n[Instrument]: ${instrumentComments}`
        : `[Instrument]: ${instrumentComments}`;
    }

    await this.orderTestRepo.save(orderTest);

    // Audit log
    await this.auditService.log({
      labId: instrument.labId,
      userId: null, // System action
      action: isUpdate ? AuditAction.RESULT_UPDATE : AuditAction.RESULT_ENTER,
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

  /**
   * Resolve sample from order number
   */
  private async findSample(orderNumber: string, labId: string): Promise<Sample | null> {
    if (!orderNumber) return null;

    // Order-number-only resolution (legacy sampleId/barcode/UUID matching removed).
    const order = await this.orderRepo.findOne({
      where: { labId, orderNumber },
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
  private parseResultValue(value: string, multiplier: number | null): {
    numericValue: number | null;
    textValue: string | null;
  } {
    if (!value || value.trim() === '') {
      return { numericValue: null, textValue: null };
    }

    // Try to parse as number
    const cleanValue = value.replace(/[<>]/g, '').trim();
    const numericValue = parseFloat(cleanValue);

    if (!isNaN(numericValue)) {
      // Apply multiplier if set
      const finalValue = multiplier ? numericValue * multiplier : numericValue;
      return {
        numericValue: Math.round(finalValue * 10000) / 10000, // Round to 4 decimal places
        textValue: null,
      };
    }

    // Not a number, store as text
    return {
      numericValue: null,
      textValue: value.trim(),
    };
  }

  /**
   * Process batch of results
   */
  async processBatch(
    instrument: Instrument,
    results: HL7Result[],
  ): Promise<{ processed: number; failed: number; errors: string[] }> {
    let processed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const result of results) {
      try {
        const processedResult = await this.processResult(instrument, result);
        if (processedResult.success) {
          processed++;
        } else {
          failed++;
          errors.push(`${result.testCode}: ${processedResult.message}`);
        }
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        errors.push(`${result.testCode}: ${errorMsg}`);
      }
    }

    return { processed, failed, errors };
  }
}
