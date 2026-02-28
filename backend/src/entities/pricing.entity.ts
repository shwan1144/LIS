import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Lab } from './lab.entity';
import { Shift } from './shift.entity';
import { Test } from './test.entity';
import { Order, PatientType } from './order.entity';

@Entity('pricing')
@Unique(['labId', 'testId', 'shiftId', 'patientType'])
export class Pricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'uuid' })
  testId: string;

  @Column({ type: 'uuid', nullable: true })
  shiftId: string | null;

  @Column({
    type: 'enum',
    enum: PatientType,
    nullable: true,
  })
  patientType: PatientType | null;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @ManyToOne(() => Test, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'testId' })
  test: Test;

  @ManyToOne(() => Shift, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shiftId' })
  shift: Shift | null;
}
