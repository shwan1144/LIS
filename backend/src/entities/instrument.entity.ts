import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Lab } from './lab.entity';

export enum InstrumentProtocol {
  HL7_V2 = 'HL7_V2',        // HL7 version 2.x
  ASTM = 'ASTM',            // ASTM E1381/E1394
  POCT1A = 'POCT1A',        // Point of Care Testing
  CUSTOM = 'CUSTOM',        // Custom protocol
}

export enum ConnectionType {
  TCP_SERVER = 'TCP_SERVER',     // LIS listens, instrument connects
  TCP_CLIENT = 'TCP_CLIENT',     // LIS connects to instrument
  SERIAL = 'SERIAL',             // RS-232 serial port
  FILE_WATCH = 'FILE_WATCH',     // Watch folder for result files
}

export enum InstrumentStatus {
  OFFLINE = 'OFFLINE',
  ONLINE = 'ONLINE',
  ERROR = 'ERROR',
  CONNECTING = 'CONNECTING',
}

@Entity('instruments')
export class Instrument {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'varchar', length: 50 })
  code: string;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  manufacturer: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  model: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  serialNumber: string | null;

  @Column({
    type: 'enum',
    enum: InstrumentProtocol,
    default: InstrumentProtocol.HL7_V2,
  })
  protocol: InstrumentProtocol;

  @Column({
    type: 'enum',
    enum: ConnectionType,
    default: ConnectionType.TCP_SERVER,
  })
  connectionType: ConnectionType;

  // TCP settings
  @Column({ type: 'varchar', length: 255, nullable: true })
  host: string | null; // For TCP_CLIENT mode

  @Column({ type: 'int', nullable: true })
  port: number | null; // TCP port

  // Serial settings
  @Column({ type: 'varchar', length: 50, nullable: true })
  serialPort: string | null; // e.g., COM1, /dev/ttyUSB0

  @Column({ type: 'int', nullable: true })
  baudRate: number | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  dataBits: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  parity: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  stopBits: string | null;

  // File watch settings
  @Column({ type: 'varchar', length: 500, nullable: true })
  watchFolder: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  filePattern: string | null; // e.g., *.txt, *.hl7

  // HL7 settings
  @Column({ type: 'varchar', length: 10, default: '\x0b' })
  hl7StartBlock: string; // VT (vertical tab) = 0x0B

  @Column({ type: 'varchar', length: 10, default: '\x1c\x0d' })
  hl7EndBlock: string; // FS + CR = 0x1C 0x0D

  @Column({ type: 'varchar', length: 100, nullable: true })
  sendingApplication: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  sendingFacility: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  receivingApplication: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  receivingFacility: string | null;

  // Status
  @Column({
    type: 'enum',
    enum: InstrumentStatus,
    default: InstrumentStatus.OFFLINE,
  })
  status: InstrumentStatus;

  @Column({ type: 'timestamp', nullable: true })
  lastConnectedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastMessageAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: true })
  autoPost: boolean; // Automatically post results to worklist

  @Column({ type: 'boolean', default: false })
  requireVerification: boolean; // Results need verification before auto-posting

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @OneToMany(() => InstrumentTestMapping, (mapping) => mapping.instrument)
  testMappings: InstrumentTestMapping[];
}

@Entity('instrument_test_mappings')
export class InstrumentTestMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  instrumentId: string;

  @Column({ type: 'uuid' })
  testId: string;

  @Column({ type: 'varchar', length: 50 })
  instrumentTestCode: string; // Code used by the instrument

  @Column({ type: 'varchar', length: 100, nullable: true })
  instrumentTestName: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  multiplier: number | null; // Unit conversion multiplier

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Instrument, (instrument) => instrument.testMappings, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instrumentId' })
  instrument: Instrument;
}

@Entity('instrument_messages')
export class InstrumentMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  instrumentId: string;

  @Column({ type: 'varchar', length: 20 })
  direction: 'IN' | 'OUT';

  @Column({ type: 'varchar', length: 20 })
  messageType: string; // ORU, ORM, ACK, etc.

  @Column({ type: 'varchar', length: 50, nullable: true })
  messageControlId: string | null;

  @Column({ type: 'text' })
  rawMessage: string;

  @Column({ type: 'jsonb', nullable: true })
  parsedMessage: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 20, default: 'RECEIVED' })
  status: 'RECEIVED' | 'PROCESSED' | 'ERROR' | 'SENT' | 'ACKNOWLEDGED';

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null; // Linked order if applicable

  @Column({ type: 'uuid', nullable: true })
  orderTestId: string | null; // Linked order test if applicable

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Instrument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instrumentId' })
  instrument: Instrument;
}
