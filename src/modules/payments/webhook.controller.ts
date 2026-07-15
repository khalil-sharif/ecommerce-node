import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
} from '@nestjs/common';
import { ApiExcludeEndpoint } from '@nestjs/swagger';
import { Request } from 'express';
import { PaymentsService } from './payments.service';
import { StripeService } from './stripe.service';
import { Public } from '../../common/decorators/public.decorator';

@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly stripe: StripeService,
  ) {}

  @Public()
  @Post('stripe')
  @HttpCode(200)
  @ApiExcludeEndpoint()
  async stripeWebhook(@Req() req: Request, @Headers('stripe-signature') signature: string) {
    const rawBody = (req as any).rawBody as Buffer | undefined;
    if (!rawBody) throw new BadRequestException('Missing raw body for signature verification');
    if (!signature) throw new BadRequestException('Missing stripe-signature header');

    let event;
    try {
      event = this.stripe.constructEvent(rawBody, signature);
    } catch (err) {
      throw new BadRequestException(`Webhook signature verification failed: ${(err as Error).message}`);
    }
    return this.payments.handleWebhook(event);
  }
}
