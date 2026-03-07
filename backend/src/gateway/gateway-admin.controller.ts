import {
  Body,
  Controller,
  Post,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { AdminHostGuard } from '../tenant/admin-host.guard';
import { AdminJwtAuthGuard } from '../admin-auth/admin-jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { GatewayService } from './gateway.service';
import { CreateGatewayActivationCodeDto } from './dto/create-gateway-activation-code.dto';

@Controller('admin/api/gateway')
@UseGuards(AdminHostGuard, AdminJwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN')
export class GatewayAdminController {
  constructor(private readonly gatewayService: GatewayService) {}

  @Post('activation-codes')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createActivationCode(@Body() dto: CreateGatewayActivationCodeDto) {
    return this.gatewayService.createActivationCode(dto);
  }
}
