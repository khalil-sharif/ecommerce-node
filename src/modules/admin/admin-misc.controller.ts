import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AnalyticsService } from './analytics.service';
import { CouponsService } from '../coupons/coupons.service';
import { ReviewsService } from '../reviews/reviews.service';
import { CreateCouponDto } from '../coupons/dto/coupon.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminMiscController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly coupons: CouponsService,
    private readonly reviews: ReviewsService,
  ) {}

  @Get('analytics')
  analyticsDashboard() {
    return this.analytics.dashboard();
  }

  @Get('analytics/revenue')
  revenue(@Query('period') period: 'day' | 'week' | 'month' = 'day') {
    return this.analytics.revenueByPeriod(period);
  }

  @Get('inventory')
  inventory() {
    return this.analytics.inventoryOverview();
  }

  @Get('coupons')
  listCoupons() {
    return this.coupons.findAll();
  }

  @Post('coupons')
  createCoupon(@Body() dto: CreateCouponDto) {
    return this.coupons.create(dto);
  }

  @Put('reviews/:id/approval')
  moderateReview(@Param('id') id: string, @Body('isApproved') isApproved: boolean) {
    return this.reviews.setApproval(id, isApproved);
  }
}
