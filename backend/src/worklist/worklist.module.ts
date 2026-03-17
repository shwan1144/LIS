import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorklistService } from './worklist.service';
import { WorklistController } from './worklist.controller';
import { OrderTest } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Antibiotic } from '../entities/antibiotic.entity';
import { Test } from '../entities/test.entity';
import { TestAntibiotic } from '../entities/test-antibiotic.entity';
import { Lab } from '../entities/lab.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import { PanelsModule } from '../panels/panels.module';
import { ResultDocumentsModule } from '../result-documents/result-documents.module';
import { ReportsModule } from '../reports/reports.module';

@Module({
  imports: [
    PanelsModule,
    ResultDocumentsModule,
    ReportsModule,
    TypeOrmModule.forFeature([
      OrderTest,
      Order,
      Test,
      TestAntibiotic,
      Antibiotic,
      Lab,
      UserDepartmentAssignment,
      Department,
    ]),
  ],
  providers: [WorklistService],
  controllers: [WorklistController],
  exports: [WorklistService],
})
export class WorklistModule {}
