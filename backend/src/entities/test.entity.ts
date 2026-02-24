import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { OrderTest } from './order-test.entity';
import { Department } from './department.entity';
import { Lab } from './lab.entity';

export interface TestParameterDefinition {
  code: string;
  label: string;
  type: 'select' | 'text';
  options?: string[]; // for type 'select': e.g. ['yellow', 'red', 'dark']
  /** Option values considered normal (e.g. ['yellow'] for Color; others like 'red' = abnormal). */
  normalOptions?: string[];
  /** Default value when entering result (e.g. 'nil' for Crystal to save time). */
  defaultValue?: string;
}

export type NumericAgeRangeSex = 'ANY' | 'M' | 'F';

export interface TestNumericAgeRange {
  sex: NumericAgeRangeSex;
  minAgeYears?: number | null;
  maxAgeYears?: number | null;
  normalMin?: number | null;
  normalMax?: number | null;
}

export type TestResultEntryType = 'NUMERIC' | 'QUALITATIVE' | 'TEXT';
export type TestResultFlag = 'N' | 'H' | 'L' | 'HH' | 'LL' | 'POS' | 'NEG' | 'ABN';

export interface TestResultTextOption {
  value: string;
  flag?: TestResultFlag | null;
  isDefault?: boolean;
}

export enum TestType {
  SINGLE = 'SINGLE',
  PANEL = 'PANEL',
}

export enum TubeType {
  SERUM = 'SERUM',
  PLASMA = 'PLASMA',
  WHOLE_BLOOD = 'WHOLE_BLOOD',
  URINE = 'URINE',
  STOOL = 'STOOL',
  SWAB = 'SWAB',
  CSF = 'CSF',
  OTHER = 'OTHER',
}

@Entity('tests')
@Index('UQ_tests_lab_code', ['labId', 'code'], { unique: true })
export class Test {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @Column({ type: 'varchar', length: 64 })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({
    type: 'enum',
    enum: TestType,
    default: TestType.SINGLE,
  })
  type: TestType;

  @Column({
    type: 'enum',
    enum: TubeType,
    default: TubeType.SERUM,
  })
  tubeType: TubeType;

  @Column({ type: 'uuid', nullable: true })
  departmentId: string | null;

  @ManyToOne(() => Department, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'departmentId' })
  department: Department | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  category: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  unit: string | null;

  // Normal range for general population
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  normalMin: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  normalMax: number | null;

  // Optional: Gender-specific ranges
  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  normalMinMale: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  normalMaxMale: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  normalMinFemale: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 4, nullable: true })
  normalMaxFemale: number | null;

  // For text-based normal values (e.g., "Negative", "Non-reactive")
  @Column({ type: 'varchar', length: 255, nullable: true })
  normalText: string | null;

  /** Result entry behavior: numeric input, qualitative dropdown, or free text */
  @Column({ type: 'varchar', length: 16, default: 'NUMERIC' })
  resultEntryType: TestResultEntryType;

  /** Optional predefined text options for qualitative/text tests (e.g. Positive/Negative). */
  @Column({ type: 'jsonb', nullable: true })
  resultTextOptions: TestResultTextOption[] | null;

  /** Allow custom text input in addition to predefined options. */
  @Column({ type: 'boolean', default: false })
  allowCustomResultText: boolean;

  /**
   * Optional age/sex-specific numeric ranges.
   * Example: [{ sex: 'F', minAgeYears: 18, maxAgeYears: 45, normalMin: 0.6, normalMax: 1.1 }]
   */
  @Column({ type: 'jsonb', nullable: true })
  numericAgeRanges: TestNumericAgeRange[] | null;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  // For panels: comma-separated child test codes or IDs
  @Column({ type: 'text', nullable: true })
  childTestIds: string | null;

  /** Optional result parameters (e.g. color: yellow/red/dark). JSON: [{ code, label, type: 'select'|'text', options?: string[] }] */
  @Column({ type: 'jsonb', nullable: true })
  parameterDefinitions: TestParameterDefinition[] | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  /** Expected completion time in minutes (from order registration). Used for progress tracking. */
  @Column({ type: 'int', nullable: true })
  expectedCompletionMinutes: number | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => OrderTest, (orderTest) => orderTest.test)
  orderTests: OrderTest[];
}
