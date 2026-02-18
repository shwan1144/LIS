import { Entity, PrimaryColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from './user.entity';
import { Lab } from './lab.entity';

@Entity('user_lab_assignments')
export class UserLabAssignment {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @PrimaryColumn({ type: 'uuid' })
  labId: string;

  @ManyToOne(() => User, (user) => user.labAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ManyToOne(() => Lab, (lab) => lab.userAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'labId' })
  lab: Lab;
}
