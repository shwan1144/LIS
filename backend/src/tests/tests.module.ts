import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Test } from '../entities/test.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { OrderTest } from '../entities/order-test.entity';
import { TestsService } from './tests.service';
import { TestsController } from './tests.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Test, Pricing, TestComponent, OrderTest])],
  controllers: [TestsController],
  providers: [TestsService],
  exports: [TestsService],
})
export class TestsModule {}
