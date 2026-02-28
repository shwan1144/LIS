import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

@Entity('admin_lab_portal_tokens')
@Index(['platformUserId', 'createdAt'])
@Index(['labId', 'createdAt'])
@Index(['expiresAt'])
@Index(['usedAt'])
export class AdminLabPortalToken {
  @PrimaryColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  platformUserId: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'varchar', length: 255 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  createdIp: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  createdUserAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  usedIp: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  usedUserAgent: string | null;

  @CreateDateColumn()
  createdAt: Date;
}

