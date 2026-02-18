"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./auth/auth.module");
const dashboard_module_1 = require("./dashboard/dashboard.module");
const patients_module_1 = require("./patients/patients.module");
const orders_module_1 = require("./orders/orders.module");
const tests_module_1 = require("./tests/tests.module");
const worklist_module_1 = require("./worklist/worklist.module");
const shifts_module_1 = require("./shifts/shifts.module");
const departments_module_1 = require("./departments/departments.module");
const settings_module_1 = require("./settings/settings.module");
const reports_module_1 = require("./reports/reports.module");
const audit_module_1 = require("./audit/audit.module");
const instruments_module_1 = require("./instruments/instruments.module");
const lab_entity_1 = require("./entities/lab.entity");
const department_entity_1 = require("./entities/department.entity");
const user_department_assignment_entity_1 = require("./entities/user-department-assignment.entity");
const patient_entity_1 = require("./entities/patient.entity");
const shift_entity_1 = require("./entities/shift.entity");
const user_entity_1 = require("./entities/user.entity");
const user_lab_assignment_entity_1 = require("./entities/user-lab-assignment.entity");
const user_shift_assignment_entity_1 = require("./entities/user-shift-assignment.entity");
const order_entity_1 = require("./entities/order.entity");
const sample_entity_1 = require("./entities/sample.entity");
const order_test_entity_1 = require("./entities/order-test.entity");
const test_entity_1 = require("./entities/test.entity");
const pricing_entity_1 = require("./entities/pricing.entity");
const audit_log_entity_1 = require("./entities/audit-log.entity");
const instrument_entity_1 = require("./entities/instrument.entity");
const test_component_entity_1 = require("./entities/test-component.entity");
const order_test_result_history_entity_1 = require("./entities/order-test-result-history.entity");
const unmatched_instrument_result_entity_1 = require("./entities/unmatched-instrument-result.entity");
const lab_orders_worklist_entity_1 = require("./entities/lab-orders-worklist.entity");
const panels_module_1 = require("./panels/panels.module");
const unmatched_module_1 = require("./unmatched/unmatched.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRoot({
                type: 'postgres',
                host: process.env.DB_HOST || 'localhost',
                port: parseInt(process.env.DB_PORT || '5432', 10),
                username: process.env.DB_USERNAME || 'postgres',
                password: process.env.DB_PASSWORD || 'postgres',
                database: process.env.DB_DATABASE || 'lis',
                entities: [
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
                ],
                synchronize: process.env.NODE_ENV !== 'production',
            }),
            auth_module_1.AuthModule,
            dashboard_module_1.DashboardModule,
            patients_module_1.PatientsModule,
            orders_module_1.OrdersModule,
            tests_module_1.TestsModule,
            worklist_module_1.WorklistModule,
            shifts_module_1.ShiftsModule,
            departments_module_1.DepartmentsModule,
            settings_module_1.SettingsModule,
            reports_module_1.ReportsModule,
            audit_module_1.AuditModule,
            instruments_module_1.InstrumentsModule,
            panels_module_1.PanelsModule,
            unmatched_module_1.UnmatchedModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map