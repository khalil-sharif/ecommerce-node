import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { CheckoutService } from './checkout.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CartContext } from '../cart/cart.service';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

@ApiTags('checkout')
@Public()
@UseGuards(OptionalJwtAuthGuard)
@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkoutService: CheckoutService) {}

  @Post()
  checkout(@Body() dto: CheckoutDto, @Req() req: Request) {
    const user = (req as any).user;
    const ctx: CartContext = user
      ? { userId: user.id }
      : { sessionId: req.cookies?.cart_session };
    return this.checkoutService.checkout(ctx, dto, user?.email);
  }
}
