import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { ApiCookieAuth } from '@nestjs/swagger';
import { CartService, CartContext } from './cart.service';
import { AddCartItemDto, UpdateCartItemDto } from './dto/cart.dto';
import { OptionalJwtAuthGuard } from '../../common/guards/optional-jwt-auth.guard';
import { Public } from '../../common/decorators/public.decorator';

const GUEST_COOKIE = 'cart_session';

@ApiTags('cart')
@ApiCookieAuth()
@Public()
@UseGuards(OptionalJwtAuthGuard)
@Controller('cart')
export class CartController {
  constructor(private readonly cartService: CartService) {}

  private ctx(req: Request, res: Response): CartContext {
    const user = (req as any).user;
    if (user) return { userId: user.id };
    let sessionId = req.cookies?.[GUEST_COOKIE];
    if (!sessionId) {
      sessionId = randomUUID();
      res.cookie(GUEST_COOKIE, sessionId, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 7 * 86400_000,
      });
    }
    return { sessionId };
  }

  @Get()
  get(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.cartService.getCart(this.ctx(req, res));
  }

  @Post('items')
  add(
    @Body() dto: AddCartItemDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cartService.addItem(this.ctx(req, res), dto.variantId, dto.quantity);
  }

  @Put('items/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCartItemDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.cartService.updateItem(this.ctx(req, res), id, dto.quantity);
  }

  @Delete('items/:id')
  remove(@Param('id') id: string, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.cartService.removeItem(this.ctx(req, res), id);
  }

  @Delete()
  clear(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    return this.cartService.clear(this.ctx(req, res));
  }
}
