import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { OrderTest } from './order-test.entity';
import { Department } from './department.entity';

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
export class Test {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
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
