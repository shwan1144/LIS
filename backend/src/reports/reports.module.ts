import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller';
import { PublicReportsController } from './public-reports.controller';
import { ReportsService } from './reports.service';
import { Order } from '../entities/order.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Patient } from '../entities/patient.entity';
import { Lab } from '../entities/lab.entity';
import { User } from '../entities/user.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { TestComponent } from '../entities/test-component.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Order, OrderTest, Patient, Lab, User, AuditLog, TestComponent])],
  controllers: [ReportsController, PublicReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
