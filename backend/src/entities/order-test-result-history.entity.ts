import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { OrderTest } from './order-test.entity';
import { ResultFlag } from './order-test.entity';

/**
 * History of result values for an OrderTest
 * Tracks all updates, reruns, corrections from instruments
 */
@Entity('order_test_result_history')
@Index(['orderTestId', 'receivedAt'])
@Index(['messageId'])
export class OrderTestResultHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  orderTestId: string;

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

  @Column({ type: 'timestamp' })
  receivedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  messageId: string | null; // FK to instrument_messages.id

  @Column({ type: 'varchar', length: 50, nullable: true })
  obxSetId: string | null; // OBX-4 (Set ID)

  @Column({ type: 'int', nullable: true })
  obxSequence: number | null; // Sequence within message

  @Column({ type: 'varchar', length: 50, nullable: true })
  instrumentCode: string | null; // Original instrument code

  @Column({ type: 'text', nullable: true })
  comments: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => OrderTest, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderTestId' })
  orderTest: OrderTest;
}
