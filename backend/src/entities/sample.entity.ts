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
import { Order } from './order.entity';
import { OrderTest } from './order-test.entity';
import { Lab } from './lab.entity';

export enum TubeType {
  SERUM = 'SERUM',
  PLASMA = 'PLASMA',
  WHOLE_BLOOD = 'WHOLE_BLOOD',
  URINE = 'URINE',
  STOOL = 'STOOL',
  SWAB = 'SWAB',
  OTHER = 'OTHER',
}

@Entity('samples')
export class Sample {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  labId: string | null;

  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sampleId: string | null;

  @Column({
    type: 'enum',
    enum: TubeType,
    nullable: true,
  })
  tubeType: TubeType | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  barcode: string | null;

  /** Tube sequence number (1, 2, 3...) within scope (tube type or department), resets per day/shift */
  @Column({ type: 'int', nullable: true })
  sequenceNumber: number | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  qrCode: string | null;

  @Column({ type: 'timestamp', nullable: true })
  collectedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Order, (order) => order.samples, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @ManyToOne(() => Lab, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab | null;

  @OneToMany(() => OrderTest, (orderTest) => orderTest.sample, { cascade: true })
  orderTests: OrderTest[];
}
