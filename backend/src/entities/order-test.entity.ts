import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Sample } from './sample.entity';
import { Test } from './test.entity';
import { Lab } from './lab.entity';

export enum OrderTestStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum ResultFlag {
  NORMAL = 'N',
  HIGH = 'H',
  LOW = 'L',
  CRITICAL_HIGH = 'HH',
  CRITICAL_LOW = 'LL',
  POSITIVE = 'POS',
  NEGATIVE = 'NEG',
  ABNORMAL = 'ABN',
}

export interface CultureResultAntibioticRow {
  antibioticId?: string | null;
  antibioticCode?: string | null;
  antibioticName?: string | null;
  interpretation: string;
  mic?: string | null;
}

export interface CultureResultIsolate {
  isolateKey: string;
  organism: string;
  source?: string | null;
  condition?: string | null;
  colonyCount?: string | null;
  comment?: string | null;
  antibiotics: CultureResultAntibioticRow[];
}

export interface CultureResultPayload {
  noGrowth: boolean;
  noGrowthResult?: string | null;
  notes?: string | null;
  isolates: CultureResultIsolate[];
}

export interface OrderTestResultDocumentSummary {
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: string | null;
  uploadedBy: string | null;
}

@Entity('order_tests')
export class OrderTest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  labId: string | null;

  @Column({ type: 'uuid' })
  sampleId: string;

  @Column({ type: 'uuid' })
  testId: string;

  @Column({ type: 'uuid', nullable: true })
  parentOrderTestId: string | null;

  @Column({
    type: 'enum',
    enum: OrderTestStatus,
    default: OrderTestStatus.PENDING,
  })
  status: OrderTestStatus;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  price: number | null;

  // Result fields
  @Column({ type: 'decimal', precision: 12, scale: 4, nullable: true })
  resultValue: number | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resultText: string | null;

  /** Parameter results (e.g. { color: 'yellow', appearance: 'clear' }). Keys match Test.parameterDefinitions[].code */
  @Column({ type: 'jsonb', nullable: true })
  resultParameters: Record<string, string> | null;

  /** CULTURE_SENSITIVITY result payload (isolates + antibiotic susceptibility rows). */
  @Column({ type: 'jsonb', nullable: true })
  cultureResult: CultureResultPayload | null;

  @Column({
    type: 'enum',
    enum: ResultFlag,
    nullable: true,
  })
  flag: ResultFlag | null;

  @Column({ type: 'timestamp', nullable: true })
  resultedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resultedBy: string | null;

  // Verification fields
  @Column({ type: 'timestamp', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  verifiedBy: string | null;

  @Column({ type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @Column({ type: 'text', nullable: true })
  resultDocumentStorageKey: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  resultDocumentFileName: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resultDocumentMimeType: string | null;

  @Column({ type: 'int', nullable: true })
  resultDocumentSizeBytes: number | null;

  @Column({ type: 'timestamp', nullable: true })
  resultDocumentUploadedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  resultDocumentUploadedBy: string | null;

  /** For panel child tests: position index in the panel. Null for non-panel or parent rows. */
  @Column({ type: 'int', nullable: true })
  panelSortOrder: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Sample, (sample) => sample.orderTests, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sampleId' })
  sample: Sample;

  @ManyToOne(() => Lab, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab | null;

  @ManyToOne(() => Test, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'testId' })
  test: Test;

  @ManyToOne(() => OrderTest, (orderTest) => orderTest.childOrderTests, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parentOrderTestId' })
  parentOrderTest: OrderTest | null;

  @OneToMany(() => OrderTest, (orderTest) => orderTest.parentOrderTest)
  childOrderTests: OrderTest[];
}
