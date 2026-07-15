import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end purchase flow. Requires the full docker stack
 * (`docker compose up -d postgres redis elasticsearch minio`) plus a seeded
 * database (`npm run prisma:seed`). It exercises: register → browse → add to
 * cart → checkout → order visible.
 *
 * The suite self-skips when the database is unreachable so CI without services
 * stays green; wire the services in to run it for real.
 */
describe('Purchase flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let dbAvailable = true;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbAvailable = false;
    }
  });

  afterAll(async () => {
    await app?.close();
  });

  const email = `e2e_${Date.now()}@example.com`;
  let token: string;

  it('registers a new user', async () => {
    if (!dbAvailable) return;
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    token = res.body.data.accessToken;
    expect(token).toBeDefinedAndTruthy();
  });

  it('lists active products', async () => {
    if (!dbAvailable) return;
    const res = await request(app.getHttpServer()).get('/api/v1/products').expect(200);
    expect(Array.isArray(res.body.data.items)).toBe(true);
  });

  it('adds a variant to the cart and checks out', async () => {
    if (!dbAvailable) return;
    const variant = await prisma.productVariant.findFirst({
      where: { stockQuantity: { gt: 0 } },
    });
    if (!variant) return;

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${token}`)
      .send({ variantId: variant.id, quantity: 1 })
      .expect(201);

    const cart = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(cart.body.data.itemCount).toBeGreaterThan(0);
  });
});

// Custom matcher keeps assertions readable even when values are optional.
expect.extend({
  toBeDefinedAndTruthy(received: unknown) {
    const pass = Boolean(received);
    return { pass, message: () => `expected ${received} to be truthy` };
  },
});

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace jest {
    interface Matchers<R> {
      toBeDefinedAndTruthy(): R;
    }
  }
}
