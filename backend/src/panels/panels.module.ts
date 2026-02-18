import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderTest } from '../entities/order-test.entity';
import { TestComponent } from '../entities/test-component.entity';
import { PanelStatusService } from './panel-status.service';

@Module({
  imports: [TypeOrmModule.forFeature([OrderTest, TestComponent])],
  providers: [PanelStatusService],
  exports: [PanelStatusService],
})
export class PanelsModule {}
