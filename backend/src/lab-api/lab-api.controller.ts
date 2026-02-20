import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LabHostGuard } from '../tenant/lab-host.guard';
import { OrderStatus } from '../entities/order.entity';
import { CreateLabOrderDto } from './dto/create-lab-order.dto';
import { EnterResultDto } from './dto/enter-result.dto';
import { UpsertPatientDto } from './dto/upsert-patient.dto';
import { LabApiService } from './lab-api.service';

interface RequestWithUser {
  user: { userId: string; labId: string; role: string };
}

@Controller('api')
@UseGuards(LabHostGuard, JwtAuthGuard)
export class LabApiController {
  constructor(private readonly labApiService: LabApiService) {}

  @Get('patients')
  async searchPatients(
    @Req() req: RequestWithUser,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.labApiService.searchPatients(req.user.labId, {
      q,
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
    });
  }

  @Post('patients')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async upsertPatient(@Req() req: RequestWithUser, @Body() dto: UpsertPatientDto) {
    return this.labApiService.upsertPatient(req.user.labId, dto, req.user.userId);
  }

  @Post('orders')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async createOrder(@Req() req: RequestWithUser, @Body() dto: CreateLabOrderDto) {
    return this.labApiService.createOrder(req.user.labId, dto, req.user.userId);
  }

  @Get('orders')
  async listOrders(
    @Req() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('status', new ParseEnumPipe(OrderStatus, { optional: true })) status?: OrderStatus,
  ) {
    return this.labApiService.listOrders(req.user.labId, {
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
      status,
    });
  }

  @Post('results')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async enterResult(@Req() req: RequestWithUser, @Body() dto: EnterResultDto) {
    return this.labApiService.enterResult(req.user.labId, dto, req.user.userId);
  }

  @Post('orders/:id/export')
  async exportOrder(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.labApiService.exportOrderResultStub(req.user.labId, id, req.user.userId);
  }
}
