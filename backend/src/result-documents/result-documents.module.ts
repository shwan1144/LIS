import { Module } from '@nestjs/common';
import { ResultDocumentsService } from './result-documents.service';

@Module({
  providers: [ResultDocumentsService],
  exports: [ResultDocumentsService],
})
export class ResultDocumentsModule {}
