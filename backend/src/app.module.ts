import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { PanelsModule } from './panels/panels.module';
import { UnmatchedModule } from './unmatched/unmatched.module';
import { TenantModule } from './tenant/tenant.module';
import { AdminAuthModule } from './admin-auth/admin-auth.module';
import { PlatformAdminModule } from './platform-admin/platform-admin.module';
import { LabApiModule } from './lab-api/lab-api.module';
import { DATABASE_ENTITIES } from './database/entities';

const useDatabaseUrl = Boolean(process.env.DATABASE_URL);
const isProduction = (process.env.NODE_ENV || '').toLowerCase() === 'production';
const shouldSynchronize = !isProduction && process.env.DB_SYNC === 'true';
const apiRateLimit = Number.parseInt(process.env.API_RATE_LIMIT || '120', 10);
const apiRateWindowSeconds = Number.parseInt(process.env.API_RATE_WINDOW_SECONDS || '60', 10);

const typeOrmConfig = useDatabaseUrl
  ? {
    type: 'postgres' as const,
    url: process.env.DATABASE_URL,
    entities: DATABASE_ENTITIES,
    synchronize: shouldSynchronize,
  }
  : {
    type: 'postgres' as const,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'lis',
    entities: DATABASE_ENTITIES,
    synchronize: shouldSynchronize,
  };

@Module({
  imports: [
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: (Number.isFinite(apiRateWindowSeconds) && apiRateWindowSeconds > 0 ? apiRateWindowSeconds : 60) * 1000,
        limit: Number.isFinite(apiRateLimit) && apiRateLimit > 0 ? apiRateLimit : 120,
      },
    ]),
    TypeOrmModule.forRoot(typeOrmConfig),
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
    TenantModule,
    AdminAuthModule,
    PlatformAdminModule,
    LabApiModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
