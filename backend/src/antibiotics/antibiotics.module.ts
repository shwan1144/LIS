import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Antibiotic } from '../entities/antibiotic.entity';
import { AntibioticsController } from './antibiotics.controller';
import { AntibioticsService } from './antibiotics.service';

@Module({
  imports: [TypeOrmModule.forFeature([Antibiotic])],
  controllers: [AntibioticsController],
  providers: [AntibioticsService],
  exports: [AntibioticsService],
})
export class AntibioticsModule {}
