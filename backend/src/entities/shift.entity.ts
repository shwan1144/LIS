import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Unique,
} from 'typeorm';
import { Lab } from './lab.entity';
import { UserShiftAssignment } from './user-shift-assignment.entity';

@Entity('shifts')
@Unique(['labId', 'code'])
export class Shift {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  name: string | null;

  /** Start time in HH:mm format (e.g. "08:00") */
  @Column({ type: 'varchar', length: 5, nullable: true })
  startTime: string | null;

  /** End time in HH:mm format (e.g. "14:00") */
  @Column({ type: 'varchar', length: 5, nullable: true })
  endTime: string | null;

  @Column({ type: 'boolean', default: false })
  isEmergency: boolean;

  @ManyToOne(() => Lab, (lab) => lab.shifts, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @OneToMany(() => UserShiftAssignment, (usa) => usa.shift)
  userAssignments: UserShiftAssignment[];
}
