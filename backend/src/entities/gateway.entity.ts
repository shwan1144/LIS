import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Lab } from './lab.entity';
import { Instrument } from './instrument.entity';

export enum GatewayDeviceStatus {
  ACTIVE = 'ACTIVE',
  AUTH_ERROR = 'AUTH_ERROR',
  ERROR = 'ERROR',
  DISABLED = 'DISABLED',
}

@Entity('gateway_devices')
@Index(['labId'])
@Index(['fingerprintHash'])
export class GatewayDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'varchar', length: 128 })
  fingerprintHash: string;

  @Column({
    type: 'enum',
    enum: GatewayDeviceStatus,
    default: GatewayDeviceStatus.ACTIVE,
  })
  status: GatewayDeviceStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  version: string | null;

  @Column({ type: 'timestamp', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  lastHeartbeat: Record<string, unknown> | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;
}

@Entity('gateway_activation_codes')
@Index(['labId'])
@Index(['expiresAt'])
export class GatewayActivationCode {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'varchar', length: 128, unique: true })
  codeHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;
}

@Entity('gateway_tokens')
@Index(['gatewayId'])
@Index(['expiresAt'])
export class GatewayToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  gatewayId: string;

  @Column({ type: 'varchar', length: 255 })
  refreshHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => GatewayDevice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gatewayId' })
  gateway: GatewayDevice;
}

@Entity('gateway_message_receipts')
@Unique('UQ_gateway_message_receipts_gateway_local', ['gatewayId', 'localMessageId'])
@Index(['gatewayId'])
@Index(['instrumentId'])
export class GatewayMessageReceipt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  gatewayId: string;

  @Column({ type: 'varchar', length: 128 })
  localMessageId: string;

  @Column({ type: 'uuid' })
  instrumentId: string;

  @Column({ type: 'uuid', nullable: true })
  serverMessageId: string | null;

  @Column({ type: 'timestamp' })
  receivedAt: Date;

  @ManyToOne(() => GatewayDevice, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'gatewayId' })
  gateway: GatewayDevice;

  @ManyToOne(() => Instrument, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instrumentId' })
  instrument: Instrument;
}
