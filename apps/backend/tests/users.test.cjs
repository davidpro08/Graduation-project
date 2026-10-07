const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/configure-app');
const { SupabaseService } = require('../dist/supabase/supabase.service');

const ids = { a: '10000000-0000-4000-8000-000000000001', b: '10000000-0000-4000-8000-000000000002' };
const profiles = new Map();
const calls = [];
let app;
function client(token) {
  return {
    auth: { async getUser(received) {
      assert.equal(received, token);
      if (token === 'network') throw new Error('sensitive upstream message');
      if (token === 'upstream') return { error: { status: 500 }, data: { user: null } };
      if (token === 'anonymous') return { data: { user: { id: ids.a, is_anonymous: true } } };
      if (!['a', 'b', 'missing', 'db-error', 'db-network'].includes(token))
        return { error: { status: 401 }, data: { user: null } };
      return { data: { user: { id: ids[token] ?? ids.a, email: token === 'b' ? undefined : 'test@example.invalid',
        identities: [{ provider: 'google' }, { provider: 'github' }, { provider: 'google' }] } } };
    } },
    from(table) {
      assert.equal(table, 'profiles');
      let nickname;
      const query = {
        select() { return query; },
        update(value) { nickname = value.nickname; return query; },
        eq(column, id) { assert.equal(column, 'id'); assert.equal(id, ids[token] ?? ids.a); return query; },
        async maybeSingle() {
          await new Promise(resolve => setTimeout(resolve, token === 'a' ? 15 : 1));
          calls.push({ token, nickname });
          if (token === 'db-network') throw new Error('sensitive database message');
          if (token === 'db-error') return { error: { message: 'sensitive database message' }, data: null };
          if (token === 'missing') return { data: null };
          const row = profiles.get(token);
          if (nickname !== undefined) { row.nickname = nickname; row.updated_at = '2026-10-01T01:00:00Z'; }
          return { data: { ...row } };
        },
      };
      return query;
    },
  };
}

before(async () => {
  for (const token of ['a', 'b']) profiles.set(token, { id: ids[token], nickname: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseService).useValue({ forUser: client }).compile();
  app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
});
after(async () => { if (app) await app.close(); });
const get = token => request(app.getHttpServer()).get('/api/users/me').set('Authorization', `Bearer ${token}`);
const patch = body => request(app.getHttpServer()).patch('/api/users/me').set('Authorization', 'Bearer a').send(body);

test('내 정보 응답은 Auth identity를 사용하며 토큰을 노출하지 않는다', async () => {
  const { body } = await get('a').expect(200);
  assert.deepEqual(body, { id: ids.a, nickname: null, email: 'test@example.invalid', providers: ['github', 'google'],
    createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z' });
  assert.equal((await get('b').expect(200)).body.email, null);
});
test('닉네임 수정은 공백을 제거하고 동일한 응답 계약을 반환한다', async () => {
  const { body } = await patch({ nickname: ' \t문재현\n ' }).expect(200);
  assert.equal(body.nickname, '문재현');
  assert.equal(body.updatedAt, '2026-10-01T01:00:00Z');
  await patch({ nickname: '가'.repeat(30) }).expect(200);
  await patch({ nickname: '😀'.repeat(30) }).expect(200);
});
test('빈 값·NULL·타입 오류·길이 초과·추가 필드를 거절한다', async () => {
  for (const body of [{}, { nickname: '' }, { nickname: ' \t\n ' }, { nickname: null }, { nickname: 3 },
    { nickname: '가'.repeat(31) }, { nickname: '😀'.repeat(31) }, { nickname: 'a', id: ids.b },
    { nickname: 'a', email: 'other@example.invalid' }]) await patch(body).expect(400);
});
test('토큰 누락·잘못된 헤더·위조·만료·익명 인증은 401이다', async () => {
  await request(app.getHttpServer()).get('/api/users/me').expect(401);
  for (const header of ['Basic a', 'Bearer', 'Bearer a b', 'Bearer a,b'])
    await request(app.getHttpServer()).get('/api/users/me').set('Authorization', header).expect(401);
  for (const token of ['forged', 'expired', 'anonymous']) await get(token).expect(401);
});
test('프로필 누락은 404, 인증·DB 장애는 상세 노출 없이 503이다', async () => {
  await get('missing').expect(404);
  for (const token of ['network', 'upstream', 'db-error', 'db-network']) {
    const response = await get(token).expect(503);
    assert.ok(!JSON.stringify(response.body).includes('sensitive'));
  }
});
test('동시 요청은 검증된 ID와 각 사용자 토큰으로 DB를 조회한다', async () => {
  calls.length = 0;
  const responses = await Promise.all([get('a'), get('b'), get('a'), get('b')]);
  assert.deepEqual(responses.map(response => response.body.id), [ids.a, ids.b, ids.a, ids.b]);
  assert.deepEqual(calls.map(call => call.token).sort(), ['a', 'a', 'b', 'b']);
});
test('Swagger에는 보호 API·DTO·오류 응답이 포함된다', async () => {
  const { body } = await request(app.getHttpServer()).get('/api/docs-json').expect(200);
  const path = body.paths['/api/users/me'];
  assert.ok(path.get.security.length);
  for (const code of ['200', '401', '404', '503']) assert.ok(path.get.responses[code]);
  assert.ok(path.patch.responses['400']);
  assert.equal(body.components.schemas.UpdateUserDto.additionalProperties, undefined);
  assert.deepEqual(body.components.schemas.UpdateUserDto.required, ['nickname']);
});

test('Supabase 실제 클라이언트는 사용자별 Authorization 헤더를 유지한다', async () => {
  const previousUrl = process.env.SUPABASE_URL;
  const previousKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const previousFetch = global.fetch;
  try {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
    const headers = [];
    global.fetch = async (_input, init) => {
      headers.push(new Headers(init.headers).get('Authorization'));
      return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
    };
    const service = new SupabaseService();
    await Promise.all(['token-a', 'token-b'].map(token => service.forUser(token).from('profiles').select('id')));
    assert.deepEqual(headers.sort(), ['Bearer token-a', 'Bearer token-b']);
    delete process.env.SUPABASE_PUBLISHABLE_KEY;
    assert.throws(() => new SupabaseService(), /SUPABASE/);
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_secret_never_allowed';
    assert.throws(() => new SupabaseService(), /publishable/);
  } finally {
    global.fetch = previousFetch;
    if (previousUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = previousKey;
  }
});
