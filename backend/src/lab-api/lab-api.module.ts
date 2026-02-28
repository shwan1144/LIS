import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { DatabaseSupportModule } from '../database/database-support.module';
import { LabApiController } from './lab-api.controller';
import { LabApiService } from './lab-api.service';

@Module({
  imports: [DatabaseSupportModule, AuditModule],
  controllers: [LabApiController],
  providers: [LabApiService],
})
export class LabApiModule {}
