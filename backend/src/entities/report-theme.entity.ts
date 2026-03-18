import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Lab } from './lab.entity';

@Entity('report_themes')
export class ReportTheme {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @ManyToOne(() => Lab)
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  /** Full report style configuration. */
  @Column({ type: 'jsonb' })
  reportStyle: any;

  /** Branding images and settings. */
  @Column({ type: 'jsonb' })
  reportBranding: any;

  @Column({ type: 'text', nullable: true })
  onlineResultWatermarkDataUrl: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  onlineResultWatermarkText: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
