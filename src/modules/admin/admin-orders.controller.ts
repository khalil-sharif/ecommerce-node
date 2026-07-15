import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { OrdersService } from '../orders/orders.service';
import { PaymentsService } from '../payments/payments.service';
import { OrderQueryDto, UpdateOrderStatusDto } from '../orders/dto/order-query.dto';
import { Roles } from '../../common/decorators/roles.decorator';

class RefundDto {
  amount?: number;
}

@ApiTags('admin/orders')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Get()
  list(@Query() query: OrderQueryDto) {
    return this.ordersService.listAll(query);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.ordersService.getById(id);
  }

  @Put(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Post(':id/refund')
  refund(@Param('id') id: string, @Body() dto: RefundDto) {
    return this.paymentsService.refundOrder(id, dto.amount);
  }
}
