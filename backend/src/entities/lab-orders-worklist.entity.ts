import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('lab_orders_worklist')
export class LabOrdersWorklist {
  @PrimaryColumn('uuid')
  labId: string;

  /** Shift ID; use empty string when no shift selected so list is per-shift */
  @PrimaryColumn({ type: 'varchar', length: 64, default: '' })
  shiftId: string;

  /** JSON array of { rowId: string, patientId: string, orderId?: string } */
  @Column({ type: 'text', nullable: true })
  itemsJson: string | null;
}
