import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Instrument } from './instrument.entity';
import { ResultFlag } from './order-test.entity';

export enum UnmatchedReason {
  UNORDERED_TEST = 'UNORDERED_TEST', // Test not ordered for this sample
  UNMATCHED_SAMPLE = 'UNMATCHED_SAMPLE', // Sample identifier not found
  NO_MAPPING = 'NO_MAPPING', // Instrument code not mapped to LIS test
  INVALID_SAMPLE_STATUS = 'INVALID_SAMPLE_STATUS', // Sample/order in wrong status
  DUPLICATE_RESULT = 'DUPLICATE_RESULT', // Result already exists (potential duplicate)
}

/**
 * Unmatched instrument results inbox
 * Stores results that cannot be automatically matched to an OrderTest
 * Requires manual review and reconciliation
 */
@Entity('unmatched_instrument_results')
@Index(['instrumentId', 'status', 'receivedAt'])
@Index(['sampleIdentifier'])
export class UnmatchedInstrumentResult {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  instrumentId: string;

  @Column({ type: 'varchar', length: 100 })
  sampleIdentifier: string; // Barcode/sample ID from HL7

  @Column({ type: 'varchar', length: 50 })
  instrumentCode: string; // Original instrument test code (e.g., "WBC")

  @Column({ type: 'varchar', length: 255, nullable: true })
  instrumentTestName: string | null;

  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  resultValue: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resultText: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  unit: string | null;

  @Column({
    type: 'enum',
    enum: ResultFlag,
    nullable: true,
  })
  flag: ResultFlag | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  referenceRange: string | null;

  @Column({
    type: 'enum',
    enum: UnmatchedReason,
  })
  reason: UnmatchedReason;

  @Column({ type: 'text', nullable: true })
  details: string | null; // Additional context/error message

  @Column({ type: 'uuid', nullable: true })
  rawMessageId: string | null; // FK to instrument_messages.id

  @Column({ type: 'timestamp' })
  receivedAt: Date;

  // Reconciliation fields
  @Column({ type: 'varchar', length: 20, default: 'PENDING' })
  status: 'PENDING' | 'RESOLVED' | 'DISCARDED';

  @Column({ type: 'uuid', nullable: true })
  resolvedOrderTestId: string | null; // If manually attached to an OrderTest

  @Column({ type: 'uuid', nullable: true })
  resolvedBy: string | null; // User who resolved it

  @Column({ type: 'timestamp', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  resolutionNotes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Instrument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instrumentId' })
  instrument: Instrument;
}
