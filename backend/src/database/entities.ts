import { AuditLog } from '../entities/audit-log.entity';
import { AdminLabPortalToken } from '../entities/admin-lab-portal-token.entity';
import { Antibiotic } from '../entities/antibiotic.entity';
import { Department } from '../entities/department.entity';
import {
  Instrument,
  InstrumentMessage,
  InstrumentTestMapping,
} from '../entities/instrument.entity';
import { LabOrdersWorklist } from '../entities/lab-orders-worklist.entity';
import { Lab } from '../entities/lab.entity';
import {
  GatewayActivationCode,
  GatewayDevice,
  GatewayMessageReceipt,
  GatewayToken,
} from '../entities/gateway.entity';
import { OrderTestResultHistory } from '../entities/order-test-result-history.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Patient } from '../entities/patient.entity';
import { Pricing } from '../entities/pricing.entity';
import { PlatformUser } from '../entities/platform-user.entity';
import { PlatformSetting } from '../entities/platform-setting.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { Result } from '../entities/result.entity';
import { Sample } from '../entities/sample.entity';
import { Shift } from '../entities/shift.entity';
import { TestComponent } from '../entities/test-component.entity';
import { TestAntibiotic } from '../entities/test-antibiotic.entity';
import { Test } from '../entities/test.entity';
import { UnmatchedInstrumentResult } from '../entities/unmatched-instrument-result.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { UserLabAssignment } from '../entities/user-lab-assignment.entity';
import { UserShiftAssignment } from '../entities/user-shift-assignment.entity';
import { User } from '../entities/user.entity';
import {
  LabMarketingTemplate,
  LabMessagingChannelConfig,
  MarketingMessageBatch,
  MarketingMessageRecipient,
} from '../entities/marketing-message.entity';

export const DATABASE_ENTITIES = [
  AdminLabPortalToken,
  Lab,
  Shift,
  User,
  UserLabAssignment,
  UserShiftAssignment,
  UserDepartmentAssignment,
  Department,
  Antibiotic,
  Patient,
  Order,
  Sample,
  OrderTest,
  Test,
  TestAntibiotic,
  Pricing,
  PlatformUser,
  PlatformSetting,
  RefreshToken,
  Result,
  AuditLog,
  Instrument,
  InstrumentTestMapping,
  InstrumentMessage,
  TestComponent,
  OrderTestResultHistory,
  UnmatchedInstrumentResult,
  LabOrdersWorklist,
  GatewayDevice,
  GatewayActivationCode,
  GatewayToken,
  GatewayMessageReceipt,
  LabMessagingChannelConfig,
  LabMarketingTemplate,
  MarketingMessageBatch,
  MarketingMessageRecipient,
];
