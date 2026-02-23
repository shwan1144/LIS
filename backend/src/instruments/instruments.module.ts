import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Instrument, InstrumentTestMapping, InstrumentMessage } from '../entities/instrument.entity';
import { OrderTest } from '../entities/order-test.entity';
import { OrderTestResultHistory } from '../entities/order-test-result-history.entity';
import { UnmatchedInstrumentResult } from '../entities/unmatched-instrument-result.entity';
import { Sample } from '../entities/sample.entity';
import { Order } from '../entities/order.entity';
import { Test } from '../entities/test.entity';
import { InstrumentsService } from './instruments.service';
import { InstrumentsController } from './instruments.controller';
import { HL7ParserService } from './hl7-parser.service';
import { AstmParserService } from './astm-parser.service';
import { TCPListenerService } from './tcp-listener.service';
import { InstrumentResultProcessor } from './result-processor.service';
import { HL7IngestionService } from './hl7-ingestion.service';
import { AstmIngestionService } from './astm-ingestion.service';
import { PanelsModule } from '../panels/panels.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Instrument,
      InstrumentTestMapping,
      InstrumentMessage,
      OrderTest,
      OrderTestResultHistory,
      UnmatchedInstrumentResult,
      Sample,
      Order,
      Test,
    ]),
    PanelsModule,
  ],
  controllers: [InstrumentsController],
  providers: [
    InstrumentsService,
    HL7ParserService,
    AstmParserService,
    TCPListenerService,
    InstrumentResultProcessor,
    HL7IngestionService,
    AstmIngestionService,
  ],
  exports: [
    InstrumentsService,
    HL7ParserService,
    AstmParserService,
    TCPListenerService,
    HL7IngestionService,
    AstmIngestionService,
  ],
})
export class InstrumentsModule {}
