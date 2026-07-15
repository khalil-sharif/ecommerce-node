import { Module } from '@nestjs/common';
import { ShippingService } from './shipping.service';
import { TaxService } from './tax.service';
import { ShippingController } from './shipping.controller';

@Module({
  controllers: [ShippingController],
  providers: [ShippingService, TaxService],
  exports: [ShippingService, TaxService],
})
export class ShippingModule {}
