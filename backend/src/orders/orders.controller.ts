import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UsePipes,
  ValidationPipe,
  ParseUUIDPipe,
  UseGuards,
  Req,
  ParseEnumPipe,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderPaymentDto } from './dto/update-payment.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OrderStatus } from '../entities/order.entity';

interface RequestWithUser {
  user: { userId: string; username: string; labId: string };
}

@Controller('orders')
@UseGuards(JwtAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Req() req: RequestWithUser, @Body() dto: CreateOrderDto) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.create(labId, dto);
  }

  @Get()
  async findAll(
    @Req() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.findAll(labId, {
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
      search,
      status: status as OrderStatus | undefined,
      patientId,
      startDate,
      endDate,
    });
  }

  @Get('estimate-price')
  async estimatePrice(
    @Req() req: RequestWithUser,
    @Query('testIds') testIds?: string,
    @Query('shiftId') shiftId?: string,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    const ids = testIds ? testIds.split(',').filter(Boolean) : [];
    return this.ordersService.estimatePrice(labId, ids, shiftId || null);
  }

  @Get('today-patients')
  async getTodayPatients(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.getTodayPatients(labId);
  }

  @Get('next-order-number')
  async getNextOrderNumber(@Req() req: RequestWithUser, @Query('shiftId') shiftId?: string) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    const next = await this.ordersService.getNextOrderNumber(labId, shiftId ?? null);
    return { orderNumber: next };
  }

  @Get('worklist')
  async getWorklist(@Req() req: RequestWithUser, @Query('shiftId') shiftId?: string) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.getWorklist(labId, shiftId ?? null);
  }

  @Post('worklist')
  async saveWorklist(
    @Req() req: RequestWithUser,
    @Body() body: { shiftId?: string; items: { rowId: string; patientId: string; orderId?: string }[] },
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    const items = Array.isArray(body?.items) ? body.items : [];
    await this.ordersService.saveWorklist(labId, body.shiftId ?? null, items);
    return { ok: true };
  }

  @Get(':id')
  async findOne(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.findOne(id, labId);
  }

  @Patch(':id/payment')
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updatePayment(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderPaymentDto,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.updatePayment(id, labId, {
      paymentStatus: dto.paymentStatus,
      paidAmount: dto.paidAmount,
    });
  }
}
