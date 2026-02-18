import { AuditLog } from '../entities/audit-log.entity';
import { Department } from '../entities/department.entity';
import {
  Instrument,
  InstrumentMessage,
  InstrumentTestMapping,
} from '../entities/instrument.entity';
import { LabOrdersWorklist } from '../entities/lab-orders-worklist.entity';
import { Lab } from '../entities/lab.entity';
import { OrderTestResultHistory } from '../entities/order-test-result-history.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Patient } from '../entities/patient.entity';
import { Pricing } from '../entities/pricing.entity';
import { Sample } from '../entities/sample.entity';
import { Shift } from '../entities/shift.entity';
import { TestComponent } from '../entities/test-component.entity';
import { Test } from '../entities/test.entity';
import { UnmatchedInstrumentResult } from '../entities/unmatched-instrument-result.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { UserLabAssignment } from '../entities/user-lab-assignment.entity';
import { UserShiftAssignment } from '../entities/user-shift-assignment.entity';
import { User } from '../entities/user.entity';

export const DATABASE_ENTITIES = [
  Lab,
  Shift,
  User,
  UserLabAssignment,
  UserShiftAssignment,
  UserDepartmentAssignment,
  Department,
  Patient,
  Order,
  Sample,
  OrderTest,
  Test,
  Pricing,
  AuditLog,
  Instrument,
  InstrumentTestMapping,
  InstrumentMessage,
  TestComponent,
  OrderTestResultHistory,
  UnmatchedInstrumentResult,
  LabOrdersWorklist,
];
