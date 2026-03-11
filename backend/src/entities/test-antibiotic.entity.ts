import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Antibiotic } from './antibiotic.entity';
import { Test } from './test.entity';

@Entity('test_antibiotics')
@Index('UQ_test_antibiotics_test_antibiotic', ['testId', 'antibioticId'], {
  unique: true,
})
export class TestAntibiotic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  testId: string;

  @Column({ type: 'uuid' })
  antibioticId: string;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  @Column({ type: 'boolean', default: false })
  isDefault: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Test, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'testId' })
  test: Test;

  @ManyToOne(() => Antibiotic, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'antibioticId' })
  antibiotic: Antibiotic;
}
