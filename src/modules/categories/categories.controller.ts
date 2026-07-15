import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator';
import { CategoriesService } from './categories.service';
import { PaginationDto } from '../../common/dto/pagination.dto';

@ApiTags('categories')
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Public()
  @Get()
  tree() {
    return this.categoriesService.tree();
  }

  @Public()
  @Get(':slug/products')
  products(@Param('slug') slug: string, @Query() pagination: PaginationDto) {
    return this.categoriesService.productsBySlug(slug, pagination);
  }

  @Public()
  @Get(':slug/breadcrumb')
  breadcrumb(@Param('slug') slug: string) {
    return this.categoriesService.breadcrumb(slug);
  }
}
