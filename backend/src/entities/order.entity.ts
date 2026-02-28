import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Patient } from './patient.entity';
import { Lab } from './lab.entity';
import { Shift } from './shift.entity';
import { Sample } from './sample.entity';

export enum OrderStatus {
  REGISTERED = 'REGISTERED',
  COLLECTED = 'COLLECTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum PatientType {
  WALK_IN = 'WALK_IN',
  HOSPITAL = 'HOSPITAL',
  CONTRACT = 'CONTRACT',
}

@Entity('orders')
@Index('UQ_orders_lab_order_number', ['labId', 'orderNumber'], {
  unique: true,
  where: '"orderNumber" IS NOT NULL',
})
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  patientId: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'uuid', nullable: true })
  shiftId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  orderNumber: string | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.REGISTERED,
  })
  status: OrderStatus;

  @Column({
    type: 'enum',
    enum: PatientType,
    default: PatientType.WALK_IN,
  })
  patientType: PatientType;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalAmount: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  discountPercent: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  finalAmount: number;

  /** unpaid | partial | paid — required to print/download/send results */
  @Column({ type: 'varchar', length: 32, default: 'unpaid' })
  paymentStatus: string;

  /** Amount paid so far (for partial); when paymentStatus is 'paid', treat as finalAmount. */
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  paidAmount: number | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  registeredAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Patient, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'patientId' })
  patient: Patient;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @ManyToOne(() => Shift, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'shiftId' })
  shift: Shift | null;

  @OneToMany(() => Sample, (sample) => sample.order, { cascade: true })
  samples: Sample[];
}
