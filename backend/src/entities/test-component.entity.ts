import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Test } from './test.entity';

/**
 * Normalized panel components table
 * Replaces CSV childTestIds with proper relational structure
 */
@Entity('test_components')
@Index(['panelTestId', 'sortOrder'])
export class TestComponent {
  @PrimaryColumn({ type: 'uuid' })
  panelTestId: string;

  @PrimaryColumn({ type: 'uuid' })
  childTestId: string;

  @Column({ type: 'boolean', default: true })
  required: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder: number;

  // Optional grouping for reports
  @Column({ type: 'varchar', length: 50, nullable: true })
  reportSection: string | null; // e.g., "Basic", "Differential", "Indices"

  @Column({ type: 'varchar', length: 50, nullable: true })
  reportGroup: string | null; // e.g., "WBC", "RBC", "Platelets"

  // Panel versioning support (for future use)
  @Column({ type: 'timestamp', nullable: true })
  effectiveFrom: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  effectiveTo: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Test, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'panelTestId' })
  panelTest: Test;

  @ManyToOne(() => Test, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'childTestId' })
  childTest: Test;
}
