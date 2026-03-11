import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Lab } from './lab.entity';
import { PlatformUser } from './platform-user.entity';
import { Order } from './order.entity';
import { Patient } from './patient.entity';

export enum MarketingChannel {
  WHATSAPP = 'WHATSAPP',
  VIBER = 'VIBER',
  SMS = 'SMS',
}

export enum MarketingMessageBatchStatus {
  QUEUED = 'QUEUED',
  RUNNING = 'RUNNING',
  COMPLETED = 'COMPLETED',
  COMPLETED_WITH_ERRORS = 'COMPLETED_WITH_ERRORS',
  FAILED = 'FAILED',
}

export enum MarketingMessageRecipientStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
  SKIPPED = 'SKIPPED',
}

@Entity('lab_messaging_channel_configs')
@Unique('UQ_lab_messaging_channel_configs_lab_channel', ['labId', 'channel'])
export class LabMessagingChannelConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({
    type: 'enum',
    enum: MarketingChannel,
    enumName: 'marketing_channel_enum',
  })
  channel: MarketingChannel;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ type: 'varchar', length: 512, nullable: true })
  webhookUrl: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  authToken: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  senderLabel: string | null;

  @Column({ type: 'integer', default: 10000 })
  timeoutMs: number;

  @Column({ type: 'integer', default: 2 })
  maxRetries: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;
}

@Entity('lab_marketing_templates')
@Unique('UQ_lab_marketing_templates_lab_channel', ['labId', 'channel'])
export class LabMarketingTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({
    type: 'enum',
    enum: MarketingChannel,
    enumName: 'marketing_channel_enum',
  })
  channel: MarketingChannel;

  @Column({ type: 'text', default: '' })
  templateText: string;

  @Column({ type: 'uuid', nullable: true })
  updatedBy: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @ManyToOne(() => PlatformUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'updatedBy' })
  updatedByUser: PlatformUser | null;
}

@Entity('marketing_message_batches')
@Index('IDX_marketing_message_batches_lab_createdAt', ['labId', 'createdAt'])
@Index('IDX_marketing_message_batches_status_createdAt', ['status', 'createdAt'])
export class MarketingMessageBatch {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({
    type: 'enum',
    enum: MarketingMessageBatchStatus,
    enumName: 'marketing_message_batch_status_enum',
    default: MarketingMessageBatchStatus.QUEUED,
  })
  status: MarketingMessageBatchStatus;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  channels: MarketingChannel[];

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  scope: Record<string, unknown>;

  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  excludedPhones: string[];

  @Column({ type: 'integer', default: 0 })
  requestedRecipientsCount: number;

  @Column({ type: 'integer', default: 0 })
  sentCount: number;

  @Column({ type: 'integer', default: 0 })
  failedCount: number;

  @Column({ type: 'integer', default: 0 })
  skippedCount: number;

  @Column({ type: 'timestamp', nullable: true })
  startedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @ManyToOne(() => PlatformUser, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'createdBy' })
  createdByUser: PlatformUser | null;

  @OneToMany(() => MarketingMessageRecipient, (recipient) => recipient.batch)
  recipients: MarketingMessageRecipient[];
}

@Entity('marketing_message_recipients')
@Index('IDX_marketing_message_recipients_batch_status', ['batchId', 'status'])
@Index('IDX_marketing_message_recipients_batch_channel', ['batchId', 'channel'])
export class MarketingMessageRecipient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  batchId: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({
    type: 'enum',
    enum: MarketingChannel,
    enumName: 'marketing_channel_enum',
  })
  channel: MarketingChannel;

  @Column({
    type: 'enum',
    enum: MarketingMessageRecipientStatus,
    enumName: 'marketing_message_recipient_status_enum',
    default: MarketingMessageRecipientStatus.PENDING,
  })
  status: MarketingMessageRecipientStatus;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'uuid', nullable: true })
  patientId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  recipientName: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  recipientPhoneRaw: string | null;

  @Column({ type: 'varchar', length: 32 })
  recipientPhoneNormalized: string;

  @Column({ type: 'text' })
  messageText: string;

  @Column({ type: 'integer', default: 0 })
  attemptCount: number;

  @Column({ type: 'timestamp', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  sentAt: Date | null;

  @Column({ type: 'text', nullable: true })
  errorMessage: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => MarketingMessageBatch, (batch) => batch.recipients, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'batchId' })
  batch: MarketingMessageBatch;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'orderId' })
  order: Order | null;

  @ManyToOne(() => Patient, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'patientId' })
  patient: Patient | null;
}
