import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrintingController } from './printing.controller';
import { QzSigningService } from './qz-signing.service';

@Module({
  imports: [AuthModule],
  controllers: [PrintingController],
  providers: [QzSigningService],
  exports: [QzSigningService],
})
export class PrintingModule {}
