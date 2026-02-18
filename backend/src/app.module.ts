import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PatientsModule } from './patients/patients.module';
import { OrdersModule } from './orders/orders.module';
import { TestsModule } from './tests/tests.module';
import { WorklistModule } from './worklist/worklist.module';
import { ShiftsModule } from './shifts/shifts.module';
import { DepartmentsModule } from './departments/departments.module';
import { SettingsModule } from './settings/settings.module';
import { ReportsModule } from './reports/reports.module';
import { AuditModule } from './audit/audit.module';
import { InstrumentsModule } from './instruments/instruments.module';
import { Lab } from './entities/lab.entity';
import { Department } from './entities/department.entity';
import { UserDepartmentAssignment } from './entities/user-department-assignment.entity';
import { Patient } from './entities/patient.entity';
import { Shift } from './entities/shift.entity';
import { User } from './entities/user.entity';
import { UserLabAssignment } from './entities/user-lab-assignment.entity';
import { UserShiftAssignment } from './entities/user-shift-assignment.entity';
import { Order } from './entities/order.entity';
import { Sample } from './entities/sample.entity';
import { OrderTest } from './entities/order-test.entity';
import { Test } from './entities/test.entity';
import { Pricing } from './entities/pricing.entity';
import { AuditLog } from './entities/audit-log.entity';
import { Instrument, InstrumentTestMapping, InstrumentMessage } from './entities/instrument.entity';
import { TestComponent } from './entities/test-component.entity';
import { OrderTestResultHistory } from './entities/order-test-result-history.entity';
import { UnmatchedInstrumentResult } from './entities/unmatched-instrument-result.entity';
import { LabOrdersWorklist } from './entities/lab-orders-worklist.entity';
import { PanelsModule } from './panels/panels.module';
import { UnmatchedModule } from './unmatched/unmatched.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_DATABASE || 'lis',
      entities: [
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
      ],
      synchronize: process.env.NODE_ENV !== 'production',
    }),
    AuthModule,
    DashboardModule,
    PatientsModule,
    OrdersModule,
    TestsModule,
    WorklistModule,
    ShiftsModule,
    DepartmentsModule,
    SettingsModule,
    ReportsModule,
    AuditModule,
    InstrumentsModule,
    PanelsModule,
    UnmatchedModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
