import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UnmatchedInstrumentResult } from '../entities/unmatched-instrument-result.entity';
import { OrderTest } from '../entities/order-test.entity';
import { UnmatchedResultsService } from './unmatched-results.service';
import { UnmatchedResultsController } from './unmatched-results.controller';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([UnmatchedInstrumentResult, OrderTest]),
    PanelsModule,
  ],
  controllers: [UnmatchedResultsController],
  providers: [UnmatchedResultsService],
  exports: [UnmatchedResultsService],
})
export class UnmatchedModule {}
