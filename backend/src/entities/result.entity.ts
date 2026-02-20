import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('results')
@Index(['labId', 'orderTestId'])
@Index(['labId', 'enteredAt'])
export class Result {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'uuid' })
  orderTestId: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  analyteCode: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  value: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  unit: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  flags: string | null;

  @Column({ type: 'timestamp', nullable: true })
  enteredAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  enteredByUserId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

