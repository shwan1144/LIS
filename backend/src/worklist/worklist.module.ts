import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WorklistService } from './worklist.service';
import { WorklistController } from './worklist.controller';
import { OrderTest } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Test } from '../entities/test.entity';
import { Lab } from '../entities/lab.entity';
import { UserDepartmentAssignment } from '../entities/user-department-assignment.entity';
import { Department } from '../entities/department.entity';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [
    PanelsModule,
    TypeOrmModule.forFeature([
      OrderTest,
      Order,
      Test,
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
