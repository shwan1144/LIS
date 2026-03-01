import { OrderStatus } from '../../entities/order.entity';
import { Patient } from '../../entities/patient.entity';

export enum CreateOrderView {
  SUMMARY = 'summary',
  FULL = 'full',
}

export interface CreateOrderSummaryDto {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  registeredAt: Date;
  paymentStatus: 'unpaid' | 'partial' | 'paid';
  paidAmount: number | null;
  totalAmount: number;
  discountPercent: number;
  finalAmount: number;
  patient: Patient;
  shift: { id: string; code: string; name: string | null } | null;
  testsCount: number;
  readyTestsCount: number;
  reportReady: boolean;
}
