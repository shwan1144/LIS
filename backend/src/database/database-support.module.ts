import { Module } from '@nestjs/common';
import { RlsSessionService } from './rls-session.service';

@Module({
  providers: [RlsSessionService],
  exports: [RlsSessionService],
})
export class DatabaseSupportModule {}
