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
const panels_module_1 = require("./panels/panels.module");
const unmatched_module_1 = require("./unmatched/unmatched.module");
const entities_1 = require("./database/entities");
const useDatabaseUrl = Boolean(process.env.DATABASE_URL);
const shouldSynchronize = process.env.DB_SYNC === 'true' ||
    (process.env.DB_SYNC !== 'false' &&
        (process.env.NODE_ENV !== 'production' || useDatabaseUrl));
const typeOrmConfig = useDatabaseUrl
    ? {
        type: 'postgres',
        url: process.env.DATABASE_URL,
        entities: entities_1.DATABASE_ENTITIES,
        synchronize: shouldSynchronize,
    }
    : {
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USERNAME || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        database: process.env.DB_DATABASE || 'lis',
        entities: entities_1.DATABASE_ENTITIES,
        synchronize: shouldSynchronize,
    };
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRoot(typeOrmConfig),
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