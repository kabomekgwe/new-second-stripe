import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { TestContainers } from './testcontainers.setup';
import { ConfigService } from '@nestjs/config';

describe('Auth Integration Tests', () => {
  let app: INestApplication;
  let testContainers: TestContainers;

  beforeAll(async () => {
    testContainers = new TestContainers();
    await testContainers.setup();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          const config = {
            DB_HOST: testContainers.postgres.getHost(),
            DB_PORT: testContainers.postgres.getPort(),
            DB_NAME: 'stripe_app_test',
            DB_USER: 'postgres',
            DB_PASSWORD: 'postgres',
            REDIS_URL: testContainers.getRedisUrl(),
            SESSION_SECRET: 'test-secret-key',
            FRONTEND_URL: 'http://localhost:3000',
          };
          return config[key];
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await testContainers?.teardown();
  });

  describe('POST /auth/register', () => {
    it('should register a new user', async () => {
      const user = {
        email: 'test@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        country: 'US',
      };

      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.email).toBe(user.email);
      expect(response.body.name).toBe(user.name);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should not allow duplicate emails', async () => {
      const user = {
        email: 'duplicate@example.com',
        password: 'SecurePass123!',
        name: 'Test User',
        country: 'US',
      };

      // First registration
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(201);

      // Second registration should fail
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user)
        .expect(409);
    });

    it('should validate required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'invalid' })
        .expect(400);

      expect(response.body.message).toBeDefined();
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      const user = {
        email: 'login@example.com',
        password: 'SecurePass123!',
        name: 'Login Test',
        country: 'US',
      };

      await request(app.getHttpServer())
        .post('/auth/register')
        .send(user);
    });

    it('should login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'login@example.com',
          password: 'SecurePass123!',
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).not.toHaveProperty('password');
    });

    it('should reject invalid credentials', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'login@example.com',
          password: 'wrongpassword',
        })
        .expect(401);
    });
  });

  describe('GET /auth/me', () => {
    let authCookie: string;

    beforeEach(async () => {
      // Register and login
      await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'me@example.com',
          password: 'SecurePass123!',
          name: 'Me Test',
          country: 'US',
        });

      const loginResponse = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'me@example.com',
          password: 'SecurePass123!',
        });

      authCookie = loginResponse.headers['set-cookie'][0];
    });

    it('should return current user', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Cookie', authCookie)
        .expect(200);

      expect(response.body.email).toBe('me@example.com');
    });

    it('should reject unauthenticated requests', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .expect(401);
    });
  });
});
