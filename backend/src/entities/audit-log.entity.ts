import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Lab } from './lab.entity';

export enum AuditActorType {
  LAB_USER = 'LAB_USER',
  PLATFORM_USER = 'PLATFORM_USER',
}

export enum AuditAction {
  // Auth
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',

  // Patient
  PATIENT_CREATE = 'PATIENT_CREATE',
  PATIENT_UPDATE = 'PATIENT_UPDATE',

  // Order
  ORDER_CREATE = 'ORDER_CREATE',
  ORDER_UPDATE = 'ORDER_UPDATE',
  ORDER_CANCEL = 'ORDER_CANCEL',

  // Results
  RESULT_ENTER = 'RESULT_ENTER',
  RESULT_UPDATE = 'RESULT_UPDATE',
  RESULT_VERIFY = 'RESULT_VERIFY',
  RESULT_REJECT = 'RESULT_REJECT',

  // Test
  TEST_CREATE = 'TEST_CREATE',
  TEST_UPDATE = 'TEST_UPDATE',
  TEST_DELETE = 'TEST_DELETE',

  // User
  USER_CREATE = 'USER_CREATE',
  USER_UPDATE = 'USER_UPDATE',
  USER_DELETE = 'USER_DELETE',

  // Settings
  SHIFT_CREATE = 'SHIFT_CREATE',
  SHIFT_UPDATE = 'SHIFT_UPDATE',
  SHIFT_DELETE = 'SHIFT_DELETE',
  DEPARTMENT_CREATE = 'DEPARTMENT_CREATE',
  DEPARTMENT_UPDATE = 'DEPARTMENT_UPDATE',
  DEPARTMENT_DELETE = 'DEPARTMENT_DELETE',

  // Report
  REPORT_GENERATE = 'REPORT_GENERATE',
  REPORT_PRINT = 'REPORT_PRINT',
  REPORT_EXPORT = 'REPORT_EXPORT',

  // Platform admin
  PLATFORM_LOGIN = 'PLATFORM_LOGIN',
  PLATFORM_LOGIN_FAILED = 'PLATFORM_LOGIN_FAILED',
  PLATFORM_LAB_CREATE = 'PLATFORM_LAB_CREATE',
  PLATFORM_LAB_UPDATE = 'PLATFORM_LAB_UPDATE',
  PLATFORM_LAB_STATUS_CHANGE = 'PLATFORM_LAB_STATUS_CHANGE',
  PLATFORM_SENSITIVE_READ = 'PLATFORM_SENSITIVE_READ',
  PLATFORM_IMPERSONATE_START = 'PLATFORM_IMPERSONATE_START',
  PLATFORM_IMPERSONATE_STOP = 'PLATFORM_IMPERSONATE_STOP',
}

@Entity('audit_logs')
@Index(['labId', 'createdAt'])
@Index(['userId', 'createdAt'])
@Index(['action', 'createdAt'])
@Index(['entityType', 'entityId'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: AuditActorType,
    nullable: true,
  })
  actorType: AuditActorType | null;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'uuid', nullable: true })
  labId: string | null;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({
    type: 'enum',
    enum: AuditAction,
  })
  action: AuditAction;

  @Column({ type: 'varchar', length: 50, nullable: true })
  entityType: string | null; // 'patient', 'order', 'order_test', 'user', etc.

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null; // ID of the affected entity

  @Column({ type: 'jsonb', nullable: true })
  oldValues: Record<string, unknown> | null; // Previous state (for updates)

  @Column({ type: 'jsonb', nullable: true })
  newValues: Record<string, unknown> | null; // New state (for creates/updates)

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null; // Human-readable description

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;

  // Relations (optional, for eager loading)
  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @ManyToOne(() => Lab, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'labId' })
  lab: Lab | null;
}
