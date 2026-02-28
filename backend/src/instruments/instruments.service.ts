import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Instrument,
  InstrumentTestMapping,
  InstrumentMessage,
  InstrumentStatus,
  InstrumentProtocol,
  ConnectionType,
} from '../entities/instrument.entity';
import { Test } from '../entities/test.entity';
import { TCPListenerService } from './tcp-listener.service';

export interface CreateInstrumentDto {
  code: string;
  name: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  protocol?: InstrumentProtocol;
  connectionType?: ConnectionType;
  host?: string;
  port?: number;
  serialPort?: string;
  baudRate?: number;
  dataBits?: string;
  parity?: string;
  stopBits?: string;
  watchFolder?: string;
  filePattern?: string;
  sendingApplication?: string;
  sendingFacility?: string;
  receivingApplication?: string;
  receivingFacility?: string;
  autoPost?: boolean;
  requireVerification?: boolean;
  bidirectionalEnabled?: boolean;
  isActive?: boolean;
}

export interface CreateMappingDto {
  testId: string;
  instrumentTestCode: string;
  instrumentTestName?: string;
  multiplier?: number;
}

export interface SendInstrumentTestOrderDto {
  orderNumber?: string;
  /** @deprecated Legacy alias for orderNumber, kept for backward compatibility. */
  orderId?: string;
  patientId: string;
  patientName: string;
  patientDob?: string;
  patientSex?: string;
  priority?: string;
  tests: Array<{
    code: string;
    name?: string;
  }>;
}

@Injectable()
export class InstrumentsService {
  constructor(
    @InjectRepository(Instrument)
    private readonly instrumentRepo: Repository<Instrument>,
    @InjectRepository(InstrumentTestMapping)
    private readonly mappingRepo: Repository<InstrumentTestMapping>,
    @InjectRepository(InstrumentMessage)
    private readonly messageRepo: Repository<InstrumentMessage>,
    @InjectRepository(Test)
    private readonly testRepo: Repository<Test>,
    private readonly tcpListener: TCPListenerService,
  ) {}

  async findAll(labId: string): Promise<Instrument[]> {
    const instruments = await this.instrumentRepo.find({
      where: { labId },
      order: { code: 'ASC' },
    });

    // Add connection status
    return instruments.map((inst) => {
      const status = this.tcpListener.getConnectionStatus(inst.id);
      return {
        ...inst,
        _connectionStatus: status,
      } as Instrument & { _connectionStatus: { connected: boolean; hasServer: boolean } };
    });
  }

  async findOne(id: string, labId: string): Promise<Instrument> {
    const instrument = await this.instrumentRepo.findOne({
      where: { id, labId },
      relations: ['testMappings'],
    });

    if (!instrument) {
      throw new NotFoundException('Instrument not found');
    }

    return instrument;
  }

  async create(labId: string, dto: CreateInstrumentDto): Promise<Instrument> {
    const normalizedCode = dto.code.trim().toUpperCase();

    // Check for duplicate code
    const existing = await this.instrumentRepo.findOne({
      where: { labId, code: normalizedCode },
    });

    if (existing) {
      throw new BadRequestException(`Instrument with code ${normalizedCode} already exists`);
    }

    const instrument = this.instrumentRepo.create({
      labId,
      ...dto,
      code: normalizedCode,
      status: InstrumentStatus.OFFLINE,
    });

    const saved = await this.instrumentRepo.save(instrument);

    // Start listener if configured
    if (saved.isActive !== false && saved.port) {
      if (saved.connectionType === ConnectionType.TCP_SERVER) {
        await this.tcpListener.startServer(saved);
      } else if (saved.connectionType === ConnectionType.TCP_CLIENT && saved.host) {
        await this.tcpListener.connectToInstrument(saved);
      }
    }

    return saved;
  }

  async update(id: string, labId: string, dto: Partial<CreateInstrumentDto>): Promise<Instrument> {
    const instrument = await this.findOne(id, labId);

    // Check for duplicate code
    if (dto.code && dto.code !== instrument.code) {
      const normalizedCode = dto.code.trim().toUpperCase();
      const existing = await this.instrumentRepo.findOne({
        where: { labId, code: normalizedCode },
      });
      if (existing) {
        throw new BadRequestException(`Instrument with code ${normalizedCode} already exists`);
      }
      dto.code = normalizedCode;
    }

    Object.assign(instrument, dto);
    const saved = await this.instrumentRepo.save(instrument);

    // Restart listener if connection settings changed
    if (
      dto.port !== undefined ||
      dto.host !== undefined ||
      dto.connectionType !== undefined ||
      dto.isActive !== undefined
    ) {
      await this.tcpListener.restartListener(id);
    }

    return saved;
  }

  async delete(id: string, labId: string): Promise<void> {
    const instrument = await this.findOne(id, labId);
    await this.instrumentRepo.remove(instrument);
  }

  async toggleActive(id: string, labId: string): Promise<Instrument> {
    const instrument = await this.findOne(id, labId);
    instrument.isActive = !instrument.isActive;
    const saved = await this.instrumentRepo.save(instrument);

    // Start or stop listener
    await this.tcpListener.restartListener(id);

    return saved;
  }

  async restartConnection(id: string, labId: string): Promise<boolean> {
    await this.findOne(id, labId); // Verify access
    return this.tcpListener.restartListener(id);
  }

  async sendTestOrder(
    id: string,
    labId: string,
    dto: SendInstrumentTestOrderDto,
  ): Promise<{ success: boolean; message: string }> {
    const instrument = await this.findOne(id, labId);

    if (!instrument.bidirectionalEnabled) {
      throw new BadRequestException('Bidirectional mode is disabled for this instrument');
    }

    const orderNumber = dto.orderNumber?.trim() || dto.orderId?.trim() || '';
    if (!orderNumber || !dto.patientId?.trim() || !dto.patientName?.trim()) {
      throw new BadRequestException('orderNumber (or legacy orderId), patientId, and patientName are required');
    }

    const normalizedTests = (dto.tests || [])
      .map((test) => ({
        code: test.code?.trim(),
        name: test.name?.trim() || test.code?.trim(),
      }))
      .filter((test) => Boolean(test.code));

    if (normalizedTests.length === 0) {
      throw new BadRequestException('At least one test is required');
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
      tests: normalizedTests as Array<{ code: string; name: string }>,
      priority: dto.priority?.trim() || 'R',
    });

    if (!sent) {
      throw new BadRequestException(
        'Failed to send order. Check instrument protocol, connection, and bidirectional mode.',
      );
    }

    return {
      success: true,
      message: `Order ${orderNumber} sent to ${instrument.code}`,
    };
  }

  // Test Mappings
  async getMappings(instrumentId: string, labId: string): Promise<InstrumentTestMapping[]> {
    await this.findOne(instrumentId, labId); // Verify access

    return this.mappingRepo.find({
      where: { instrumentId },
      order: { instrumentTestCode: 'ASC' },
    });
  }

  /** Mappings for a given test (so Test management can show "this test receives from these instruments"). */
  async getMappingsByTestId(testId: string, labId: string): Promise<(InstrumentTestMapping & { instrument: Instrument })[]> {
    const test = await this.testRepo.findOne({ where: { id: testId, labId } });
    if (!test) throw new NotFoundException('Test not found');

    const mappings = await this.mappingRepo.find({
      where: { testId },
      relations: ['instrument'],
      order: { instrumentTestCode: 'ASC' },
    });

    return mappings.filter((m) => m.instrument?.labId === labId) as (InstrumentTestMapping & { instrument: Instrument })[];
  }

  async createMapping(instrumentId: string, labId: string, dto: CreateMappingDto): Promise<InstrumentTestMapping> {
    await this.findOne(instrumentId, labId); // Verify access

    // Verify test exists
    const test = await this.testRepo.findOne({ where: { id: dto.testId, labId } });
    if (!test) {
      throw new NotFoundException('Test not found');
    }

    // Check for duplicate mapping
    const existing = await this.mappingRepo.findOne({
      where: { instrumentId, instrumentTestCode: dto.instrumentTestCode },
    });
    if (existing) {
      throw new BadRequestException(`Mapping for code ${dto.instrumentTestCode} already exists`);
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

  async updateMapping(
    instrumentId: string,
    mappingId: string,
    labId: string,
    dto: Partial<CreateMappingDto>,
  ): Promise<InstrumentTestMapping> {
    await this.findOne(instrumentId, labId); // Verify access

    const mapping = await this.mappingRepo.findOne({
      where: { id: mappingId, instrumentId },
    });

    if (!mapping) {
      throw new NotFoundException('Mapping not found');
    }

    if (dto.testId) {
      const test = await this.testRepo.findOne({ where: { id: dto.testId, labId } });
      if (!test) {
        throw new NotFoundException('Test not found');
      }
      mapping.testId = dto.testId;
    }

    if (dto.instrumentTestCode !== undefined) mapping.instrumentTestCode = dto.instrumentTestCode;
    if (dto.instrumentTestName !== undefined) mapping.instrumentTestName = dto.instrumentTestName || null;
    if (dto.multiplier !== undefined) mapping.multiplier = dto.multiplier || null;

    return this.mappingRepo.save(mapping);
  }

  async deleteMapping(instrumentId: string, mappingId: string, labId: string): Promise<void> {
    await this.findOne(instrumentId, labId); // Verify access

    const mapping = await this.mappingRepo.findOne({
      where: { id: mappingId, instrumentId },
    });

    if (!mapping) {
      throw new NotFoundException('Mapping not found');
    }

    await this.mappingRepo.remove(mapping);
  }

  // Messages
  async getMessages(
    instrumentId: string,
    labId: string,
    params: { page?: number; size?: number; direction?: 'IN' | 'OUT' },
  ): Promise<{ items: InstrumentMessage[]; total: number }> {
    await this.findOne(instrumentId, labId); // Verify access

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

  // Simulate message
  async simulateMessage(
    instrumentId: string,
    labId: string,
    rawMessage: string,
  ): Promise<{ success: boolean; message?: string; messageId?: string }> {
    const instrument = await this.findOne(instrumentId, labId);
    return this.tcpListener.simulateMessage(instrument, rawMessage);
  }
}
