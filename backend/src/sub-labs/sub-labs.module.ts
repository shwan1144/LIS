import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SubLabsController } from './sub-labs.controller';
import { SubLabsService } from './sub-labs.service';
import { SubLab } from '../entities/sub-lab.entity';
import { SubLabTestPrice } from '../entities/sub-lab-test-price.entity';
import { User } from '../entities/user.entity';
import { Test } from '../entities/test.entity';
import { Order } from '../entities/order.entity';
import { OrdersModule } from '../orders/orders.module';
import { ReportsModule } from '../reports/reports.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([SubLab, SubLabTestPrice, User, Test, Order]),
    OrdersModule,
    ReportsModule,
    DashboardModule,
    AuthModule,
  ],
  controllers: [SubLabsController],
  providers: [SubLabsService],
  exports: [SubLabsService],
})
export class SubLabsModule {}
