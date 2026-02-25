import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Patient } from '../entities/patient.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Order } from '../entities/order.entity';
import { Lab } from '../entities/lab.entity';
import { Shift } from '../entities/shift.entity';
import { Department } from '../entities/department.entity';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { OrdersModule } from '../orders/orders.module';
import { UnmatchedModule } from '../unmatched/unmatched.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Patient, OrderTest, Order, Lab, Shift, Department]),
    OrdersModule,
    UnmatchedModule,
    AuthModule,
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
