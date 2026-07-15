import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { ProductsService } from '../products/products.service';
import { StorageService } from '../../common/storage/storage.service';
import { CreateProductDto, ProductQueryDto, UpdateProductDto } from '../products/dto/product.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('admin/products')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/products')
export class AdminProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  list(@Query() query: ProductQueryDto) {
    return this.productsService.list(query, { includeAllStatuses: true });
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.productsService.findById(id);
  }

  @Post()
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.productsService.remove(id);
  }

  @Post(':id/images')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string },
  ) {
    const { url } = await this.storage.uploadImage(file.buffer, file.originalname, file.mimetype);
    return this.productsService.addImage(id, { url, alt: file.originalname });
  }
}
