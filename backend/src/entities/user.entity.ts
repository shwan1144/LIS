import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserLabAssignment } from './user-lab-assignment.entity';
import { UserShiftAssignment } from './user-shift-assignment.entity';
import { UserDepartmentAssignment } from './user-department-assignment.entity';
import { Lab } from './lab.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, unique: true })
  username: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fullName: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 32 })
  role: string;

  @Column({ type: 'uuid', nullable: true })
  defaultLabId: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => UserLabAssignment, (ula) => ula.user)
  labAssignments: UserLabAssignment[];

  @OneToMany(() => UserShiftAssignment, (usa) => usa.user)
  shiftAssignments: UserShiftAssignment[];

  @OneToMany(() => UserDepartmentAssignment, (uda) => uda.user)
  departmentAssignments: UserDepartmentAssignment[];

  @ManyToOne(() => Lab, { nullable: true })
  @JoinColumn({ name: 'defaultLabId' })
  defaultLab: Lab | null;
}
