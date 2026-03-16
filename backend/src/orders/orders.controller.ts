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
  Logger,
} from '@nestjs/common';
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { UpdateOrderPaymentDto } from './dto/update-payment.dto';
import { UpdateOrderTestsDto } from './dto/update-order-tests.dto';
import { UpdateOrderDiscountDto } from './dto/update-order-discount.dto';
import { UpdateOrderDeliveryMethodsDto } from './dto/update-order-delivery-methods.dto';
import { UpdateOrderNotesDto } from './dto/update-order-notes.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import {
  CreateOrderView,
  OrderDetailView,
  OrderResultStatus,
} from './dto/create-order-response.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { OrderStatus } from '../entities/order.entity';
import { buildLabActorContext } from '../types/lab-actor-context';
import { LAB_ROLE_GROUPS } from '../auth/lab-role-matrix';

interface RequestWithUser {
  user: {
    userId?: string | null;
    platformUserId?: string | null;
    isImpersonation?: boolean;
    username: string;
    labId: string;
    role?: string;
  };
}

@Controller('orders')
@UseGuards(JwtAuthGuard, RolesGuard)
export class OrdersController {
  private readonly logger = new Logger(OrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(
    @Req() req: RequestWithUser,
    @Body() dto: CreateOrderDto,
    @Query('view', new ParseEnumPipe(CreateOrderView, { optional: true }))
    view?: CreateOrderView,
  ) {
    const requestStartedAt = process.hrtime.bigint();
    const selectedView = view ?? CreateOrderView.SUMMARY;
    const labId = req.user?.labId;
    try {
      if (!labId) {
        throw new Error('Lab ID not found in token');
      }
      return await this.ordersService.create(labId, dto, selectedView);
    } finally {
      const durationMs = Number(process.hrtime.bigint() - requestStartedAt) / 1_000_000;
      this.logger.log(
        JSON.stringify({
          event: 'orders.create.request',
          view: selectedView,
          labId: labId ?? null,
          durationMs: Math.round(durationMs * 100) / 100,
        }),
      );
    }
  }

  @Get()
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  async findAll(
    @Req() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('shiftId') shiftId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('dateFilterTimeZone') dateFilterTimeZone?: string,
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
      shiftId,
      startDate,
      endDate,
      dateFilterTimeZone,
    });
  }

  @Get('estimate-price')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
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
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  async getTodayPatients(@Req() req: RequestWithUser) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.getTodayPatients(labId);
  }

  @Get('next-order-number')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  async getNextOrderNumber(@Req() req: RequestWithUser, @Query('shiftId') shiftId?: string) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    const next = await this.ordersService.getNextOrderNumber(labId, shiftId ?? null);
    return { orderNumber: next };
  }

  @Get('worklist')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  async getWorklist(@Req() req: RequestWithUser, @Query('shiftId') shiftId?: string) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.getWorklist(labId, shiftId ?? null);
  }

  @Post('worklist')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
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

  @Get('history')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_HISTORY_READ)
  async findHistory(
    @Req() req: RequestWithUser,
    @Query('page') page?: string,
    @Query('size') size?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('patientId') patientId?: string,
    @Query('shiftId') shiftId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('dateFilterTimeZone') dateFilterTimeZone?: string,
    @Query('resultStatus', new ParseEnumPipe(OrderResultStatus, { optional: true }))
    resultStatus?: OrderResultStatus,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.findHistory(labId, {
      page: page ? parseInt(page, 10) : undefined,
      size: size ? parseInt(size, 10) : undefined,
      search,
      status: status as OrderStatus | undefined,
      patientId,
      shiftId,
      startDate,
      endDate,
      dateFilterTimeZone,
      resultStatus,
    });
  }

  @Get(':id')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_HISTORY_READ)
  async findOne(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('view', new ParseEnumPipe(OrderDetailView, { optional: true }))
    view?: OrderDetailView,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.findOne(id, labId, view ?? OrderDetailView.COMPACT);
  }

  @Patch(':id/payment')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
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

  @Patch(':id/discount')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateDiscount(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDiscountDto,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.updateDiscount(id, labId, dto.discountPercent);
  }

  @Patch(':id/notes')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateOrderNotes(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderNotesDto,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.updateNotes(id, labId, dto.notes, actor);
  }

  @Patch(':id/tests')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateOrderTests(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderTestsDto,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.updateOrderTests(id, labId, dto.testIds, actor, req.user?.role, {
      forceRemoveVerified: dto.forceRemoveVerified,
      removalReason: dto.removalReason,
    });
  }

  @Patch(':id/delivery-methods')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async updateOrderDeliveryMethods(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrderDeliveryMethodsDto,
  ) {
    const labId = req.user?.labId;
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.updateDeliveryMethods(id, labId, dto.deliveryMethods);
  }

  @Patch(':id/cancel')
  @Roles(...LAB_ROLE_GROUPS.ORDERS_WORKFLOW)
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async cancelOrder(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
  ) {
    const labId = req.user?.labId;
    const actor = buildLabActorContext(req.user);
    if (!labId) {
      throw new Error('Lab ID not found in token');
    }
    return this.ordersService.cancelOrder(id, labId, actor, dto.reason);
  }
}
