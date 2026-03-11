import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Lab } from '../entities/lab.entity';
import { Order } from '../entities/order.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { PlatformSetting } from '../entities/platform-setting.entity';
import {
  LabMarketingTemplate,
  LabMessagingChannelConfig,
  MarketingMessageBatch,
  MarketingMessageRecipient,
} from '../entities/marketing-message.entity';
import { DatabaseSupportModule } from '../database/database-support.module';
import { SettingsModule } from '../settings/settings.module';
import { ReportsModule } from '../reports/reports.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { AuthModule } from '../auth/auth.module';
import { PlatformAdminController } from './platform-admin.controller';
import { PlatformAdminService } from './platform-admin.service';
import { BulkMessagingController } from './bulk-messaging.controller';
import { BulkMessagingService } from './bulk-messaging.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lab,
      Order,
      AuditLog,
      PlatformSetting,
      LabMessagingChannelConfig,
      LabMarketingTemplate,
      MarketingMessageBatch,
      MarketingMessageRecipient,
    ]),
    DatabaseSupportModule,
    SettingsModule,
    ReportsModule,
    AdminAuthModule,
    AuthModule,
  ],
  controllers: [PlatformAdminController, BulkMessagingController],
  providers: [PlatformAdminService, BulkMessagingService],
})
export class PlatformAdminModule {}
