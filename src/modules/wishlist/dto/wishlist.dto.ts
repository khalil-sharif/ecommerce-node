import { IsUUID } from 'class-validator';

export class AddWishlistDto {
  @IsUUID()
  variantId: string;
}
