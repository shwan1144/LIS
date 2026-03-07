import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { GatewayService } from './gateway.service';
import { GatewayAuthGuard } from './gateway-auth.guard';
import { ActivateGatewayDto } from './dto/activate-gateway.dto';
import { RefreshGatewayTokenDto } from './dto/refresh-gateway-token.dto';
import { GatewayMessageDto } from './dto/gateway-message.dto';
import { GatewayHeartbeatDto } from './dto/gateway-heartbeat.dto';

interface RequestWithGatewayAuth {
  user: {
    gatewayId: string;
    labId: string;
    scope: string[];
  };
}

@Controller('gateway')
export class GatewayController {
  constructor(private readonly gatewayService: GatewayService) {}

  @Post('activate')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async activate(@Body() dto: ActivateGatewayDto) {
    return this.gatewayService.activateGateway(dto);
  }

  @Post('token/refresh')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async refreshToken(@Body() dto: RefreshGatewayTokenDto) {
    return this.gatewayService.refreshGatewayToken(dto);
  }

  @Get('config')
  @UseGuards(GatewayAuthGuard)
  async getConfig(@Req() req: RequestWithGatewayAuth) {
    return this.gatewayService.getGatewayConfig(req.user);
  }

  @Post('messages')
  @UseGuards(GatewayAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async ingestMessage(@Req() req: RequestWithGatewayAuth, @Body() dto: GatewayMessageDto) {
    return this.gatewayService.ingestGatewayMessage(req.user, dto);
  }

  @Post('heartbeat')
  @UseGuards(GatewayAuthGuard)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async heartbeat(@Req() req: RequestWithGatewayAuth, @Body() dto: GatewayHeartbeatDto) {
    return this.gatewayService.recordHeartbeat(req.user, dto);
  }
}
