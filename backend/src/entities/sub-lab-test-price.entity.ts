import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { SubLab } from './sub-lab.entity';
import { Test } from './test.entity';

@Entity('sub_lab_test_prices')
@Unique('UQ_sub_lab_test_prices_sub_lab_test', ['subLabId', 'testId'])
@Index('IDX_sub_lab_test_prices_sub_lab_active', ['subLabId', 'isActive'])
export class SubLabTestPrice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  subLabId: string;

  @Column({ type: 'uuid' })
  testId: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => SubLab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subLabId' })
  subLab: SubLab;

  @ManyToOne(() => Test, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'testId' })
  test: Test;
}
