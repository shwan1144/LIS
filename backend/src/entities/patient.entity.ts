import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('patients')
export class Patient {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Unique patient ID for search - immutable, auto-generated on creation */
  @Column({ type: 'varchar', length: 24, unique: true })
  patientNumber: string;

  @Column({ type: 'varchar', length: 64, nullable: true, unique: true })
  nationalId: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  externalId: string | null;

  @Column({ type: 'varchar', length: 256 })
  fullName: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: string | null;

  @Column({ type: 'char', length: 1, nullable: true })
  sex: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
