import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RefreshTokenActorType {
  LAB_USER = 'LAB_USER',
  PLATFORM_USER = 'PLATFORM_USER',
}

@Entity('refresh_tokens')
@Index(['actorType', 'actorId'])
@Index(['familyId'])
export class RefreshToken {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @Column({
    type: 'enum',
    enum: RefreshTokenActorType,
  })
  actorType: RefreshTokenActorType;

  @Column({ type: 'uuid' })
  actorId: string;

  @Column({ type: 'uuid' })
  familyId: string;

  @Column({ type: 'varchar', length: 255 })
  tokenHash: string;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  replacedByTokenId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  context: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  createdIp: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  createdUserAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
