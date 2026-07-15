import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Populates request.user when a valid token is present, but never rejects.
 * Used by cart/checkout flows that support both guest and authenticated users.
 */
@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest<TUser = any>(_err: any, user: any): TUser {
    return user || undefined;
  }
}
