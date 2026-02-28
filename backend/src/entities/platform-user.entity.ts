import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum PlatformUserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  AUDITOR = 'AUDITOR',
}

@Entity('platform_users')
@Index(['email'], { unique: true })
export class PlatformUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({
    type: 'enum',
    enum: PlatformUserRole,
    default: PlatformUserRole.AUDITOR,
  })
  role: PlatformUserRole;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  mfaSecret: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

