import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserLabAssignment } from './user-lab-assignment.entity';
import { Shift } from './shift.entity';
import { Department } from './department.entity';

@Entity('labs')
export class Lab {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Label sequence scope: by tube type (SERUM 1,2,3 / EDTA 1,2,3) or by department */
  @Column({ type: 'varchar', length: 32, default: 'tube_type' })
  labelSequenceBy: string;

  /** When sequence restarts: per day or per shift */
  @Column({ type: 'varchar', length: 32, default: 'day' })
  sequenceResetBy: string;

  /** Allow patients to open online result page from receipt QR. */
  @Column({ type: 'boolean', default: true })
  enableOnlineResults: boolean;

  /** Optional branded report banner image as data URL (PNG/JPG/WebP). */
  @Column({ type: 'text', nullable: true })
  reportBannerDataUrl: string | null;

  /** Optional branded report footer image as data URL (PNG/JPG/WebP). */
  @Column({ type: 'text', nullable: true })
  reportFooterDataUrl: string | null;

  /** Optional report logo image as data URL (PNG/JPG/WebP). */
  @Column({ type: 'text', nullable: true })
  reportLogoDataUrl: string | null;

  /** Optional report watermark image as data URL (PNG/JPG/WebP). */
  @Column({ type: 'text', nullable: true })
  reportWatermarkDataUrl: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => UserLabAssignment, (ula) => ula.lab)
  userAssignments: UserLabAssignment[];

  @OneToMany(() => Shift, (shift) => shift.lab)
  shifts: Shift[];

  @OneToMany(() => Department, (dept) => dept.lab)
  departments: Department[];
}
