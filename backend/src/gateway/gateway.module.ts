import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GatewayController } from './gateway.controller';
import { GatewayAdminController } from './gateway-admin.controller';
import { GatewayService } from './gateway.service';
import { GatewayAuthGuard } from './gateway-auth.guard';
import { GatewayJwtStrategy } from './gateway-jwt.strategy';
import {
  GatewayActivationCode,
  GatewayDevice,
  GatewayMessageReceipt,
  GatewayToken,
} from '../entities/gateway.entity';
import { Instrument } from '../entities/instrument.entity';
import { Lab } from '../entities/lab.entity';
import { AuthModule } from '../auth/auth.module';
import { InstrumentsModule } from '../instruments/instruments.module';
import { AdminAuthModule } from '../admin-auth/admin-auth.module';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      GatewayDevice,
      GatewayActivationCode,
      GatewayToken,
      GatewayMessageReceipt,
      Instrument,
      Lab,
    ]),
    AuthModule,
    InstrumentsModule,
    AdminAuthModule,
    TenantModule,
  ],
  controllers: [GatewayController, GatewayAdminController],
  providers: [GatewayService, GatewayJwtStrategy, GatewayAuthGuard],
  exports: [GatewayService],
})
export class GatewayModule {}
