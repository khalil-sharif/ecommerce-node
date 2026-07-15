import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WishlistService } from './wishlist.service';
import { AddWishlistDto } from './dto/wishlist.dto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('wishlist')
@ApiBearerAuth()
@Controller('wishlist')
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Post()
  add(@CurrentUser('id') userId: string, @Body() dto: AddWishlistDto) {
    return this.wishlistService.add(userId, dto.variantId);
  }

  @Get()
  list(@CurrentUser('id') userId: string) {
    return this.wishlistService.list(userId);
  }

  @Get('check')
  has(@CurrentUser('id') userId: string, @Query('variantId') variantId: string) {
    return this.wishlistService.has(userId, variantId);
  }

  @Delete(':id')
  remove(@CurrentUser('id') userId: string, @Param('id') id: string) {
    return this.wishlistService.remove(userId, id);
  }
}
