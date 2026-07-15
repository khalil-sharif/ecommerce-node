import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CouponsService } from './coupons.service';
import { ValidateCouponDto } from './dto/coupon.dto';

@ApiTags('coupons')
@Controller('checkout')
export class CouponsController {
  constructor(private readonly couponsService: CouponsService) {}

  @Public()
  @Post('validate-coupon')
  async validate(@Body() dto: ValidateCouponDto) {
    const result = await this.couponsService.validate(dto.code, dto.subtotal ?? 0);
    return {
      code: result.coupon.code,
      type: result.coupon.type,
      discount: result.discount,
      freeShipping: result.freeShipping,
      valid: true,
    };
  }
}
