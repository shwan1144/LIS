import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Lab } from './lab.entity';

@Entity('departments')
@Unique(['labId', 'code'])
export class Department {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'varchar', length: 32 })
  code: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @ManyToOne(() => Lab, (lab) => lab.departments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;
}
