import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lab } from '../entities/lab.entity';
import { Order } from '../entities/order.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { DatabaseSupportModule } from '../database/database-support.module';
import { SettingsModule } from '../settings/settings.module';
import { ReportsModule } from '../reports/reports.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Lab, Order, AuditLog]),
    DatabaseSupportModule,
    SettingsModule,
    ReportsModule,
    AdminAuthModule,
    AuthModule,
  ],
  controllers: [PlatformAdminController],
  providers: [PlatformAdminService],
})
export class PlatformAdminModule {}
