import { Module } from '@nestjs/common';
import { AdminProductsController } from './admin-products.controller';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminMiscController } from './admin-misc.controller';
import { AnalyticsService } from './analytics.service';
import { ProductsModule } from '../products/products.module';
import { OrdersModule } from '../orders/orders.module';
import { PaymentsModule } from '../payments/payments.module';
import { CouponsModule } from '../coupons/coupons.module';
import { ReviewsModule } from '../reviews/reviews.module';

@Module({
  imports: [ProductsModule, OrdersModule, PaymentsModule, CouponsModule, ReviewsModule],
  controllers: [AdminProductsController, AdminOrdersController, AdminMiscController],
  providers: [AnalyticsService],
})
export class AdminModule {}
