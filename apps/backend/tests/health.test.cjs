const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/configure-app');

let app;
before(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});
after(async () => { if (app) await app.close(); });

test('인증 없이 /api/health 상태를 조회하고 미구현 경로는 404를 반환한다', async () => {
  const response = await request(app.getHttpServer()).get('/api/health').expect(200);
  assert.deepEqual(response.body, { status: 'ok', service: 'backend' });
  await request(app.getHttpServer()).get('/health').expect(404);
  await request(app.getHttpServer()).get('/api/conversations').expect(404);
});

test('Swagger UI와 OpenAPI가 실제 health 경로와 응답을 노출한다', async () => {
  await request(app.getHttpServer()).get('/api/docs').expect(200);
  const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
  assert.ok(body.paths['/api/health'].get.responses['200']);
  assert.ok(body.components.schemas.HealthResponse);
  assert.equal(body.paths['/api/conversations'], undefined);
});
