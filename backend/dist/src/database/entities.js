"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DATABASE_ENTITIES = void 0;
const audit_log_entity_1 = require("../entities/audit-log.entity");
const department_entity_1 = require("../entities/department.entity");
const instrument_entity_1 = require("../entities/instrument.entity");
const lab_orders_worklist_entity_1 = require("../entities/lab-orders-worklist.entity");
const lab_entity_1 = require("../entities/lab.entity");
const order_test_result_history_entity_1 = require("../entities/order-test-result-history.entity");
const order_test_entity_1 = require("../entities/order-test.entity");
const order_entity_1 = require("../entities/order.entity");
const patient_entity_1 = require("../entities/patient.entity");
const pricing_entity_1 = require("../entities/pricing.entity");
const sample_entity_1 = require("../entities/sample.entity");
const shift_entity_1 = require("../entities/shift.entity");
const test_component_entity_1 = require("../entities/test-component.entity");
const test_entity_1 = require("../entities/test.entity");
const unmatched_instrument_result_entity_1 = require("../entities/unmatched-instrument-result.entity");
const user_department_assignment_entity_1 = require("../entities/user-department-assignment.entity");
const user_lab_assignment_entity_1 = require("../entities/user-lab-assignment.entity");
const user_shift_assignment_entity_1 = require("../entities/user-shift-assignment.entity");
const user_entity_1 = require("../entities/user.entity");
exports.DATABASE_ENTITIES = [
    lab_entity_1.Lab,
    shift_entity_1.Shift,
    user_entity_1.User,
    user_lab_assignment_entity_1.UserLabAssignment,
    user_shift_assignment_entity_1.UserShiftAssignment,
    user_department_assignment_entity_1.UserDepartmentAssignment,
    department_entity_1.Department,
    patient_entity_1.Patient,
    order_entity_1.Order,
    sample_entity_1.Sample,
    order_test_entity_1.OrderTest,
    test_entity_1.Test,
    pricing_entity_1.Pricing,
    audit_log_entity_1.AuditLog,
    instrument_entity_1.Instrument,
    instrument_entity_1.InstrumentTestMapping,
    instrument_entity_1.InstrumentMessage,
    test_component_entity_1.TestComponent,
    order_test_result_history_entity_1.OrderTestResultHistory,
    unmatched_instrument_result_entity_1.UnmatchedInstrumentResult,
    lab_orders_worklist_entity_1.LabOrdersWorklist,
];
//# sourceMappingURL=entities.js.map