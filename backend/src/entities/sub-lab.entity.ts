import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Lab } from './lab.entity';
import { User } from './user.entity';
import { SubLabTestPrice } from './sub-lab-test-price.entity';
import { Order } from './order.entity';

@Entity('sub_labs')
@Index('IDX_sub_labs_lab_name', ['labId', 'name'])
export class SubLab {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  labId: string;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @ManyToOne(() => Lab, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;

  @OneToMany(() => User, (user) => user.subLab)
  users: User[];

  @OneToMany(() => SubLabTestPrice, (price) => price.subLab)
  testPrices: SubLabTestPrice[];

  @OneToMany(() => Order, (order) => order.sourceSubLab)
  orders: Order[];
}
