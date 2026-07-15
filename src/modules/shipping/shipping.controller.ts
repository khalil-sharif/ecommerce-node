import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { ShippingService } from './shipping.service';
import { ShippingQuoteDto } from './dto/shipping-quote.dto';

@ApiTags('shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  @Public()
  @Get('rates')
  rates(@Query() dto: ShippingQuoteDto) {
    return this.shippingService.quoteAll({
      country: dto.country,
      state: dto.state,
      totalWeightKg: dto.weight ?? 1,
      subtotal: dto.subtotal ?? 0,
    });
  }
}
