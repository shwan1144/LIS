import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Test } from '../entities/test.entity';
import { Antibiotic } from '../entities/antibiotic.entity';
import { Pricing } from '../entities/pricing.entity';
import { TestComponent } from '../entities/test-component.entity';
import { TestAntibiotic } from '../entities/test-antibiotic.entity';
import { OrderTest } from '../entities/order-test.entity';
import { Department } from '../entities/department.entity';
import { TestsService } from './tests.service';
import { TestsController } from './tests.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Test,
      Pricing,
      TestComponent,
      TestAntibiotic,
      Antibiotic,
      OrderTest,
      Department,
    ]),
  ],
  controllers: [TestsController],
  providers: [TestsService],
  exports: [TestsService],
})
export class TestsModule {}
