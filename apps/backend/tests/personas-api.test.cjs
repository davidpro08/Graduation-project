require('reflect-metadata');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const request = require('supertest');
const { Test } = require('@nestjs/testing');
const { NotFoundException } = require('@nestjs/common');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/configure-app');
const { SupabaseService } = require('../dist/supabase/supabase.service');
const { AuthService } = require('../dist/auth/auth.service');
const { ConversationsService } = require('../dist/conversations/conversations.service');
const { PERSONA_SOURCE, dimensions } = require('../dist/personas/persona.types');
const owner = randomUUID(), other = randomUUID(), chat = randomUUID(), url = `/api/conversations/${chat}/personas`;
let app, last;
const profile = { id: 'a'.repeat(32), name: '김가람', age: 30, ageGroup: '30-39', sex: '여자', province: '서울', education: '4년제 대학교', occupation: '개발자', maritalStatus: '미혼', familyType: '혼자 거주', district: '서울-강서구', bachelorsField: '공학', housingType: '아파트', militaryStatus: '비현역', persona: '김가람 씨는 합성 페르소나입니다.' };
const source = {
  facets: async (context, query) => { last = { context, query }; return { values: Object.fromEntries(dimensions.map(key => [key, [profile[key]]])), population: 50000, age: { min: 19, max: 99 }, occupation: { total: 2120, page: query.page, pageSize: 50, search: query.occupationSearch ?? '' } }; },
  select: async (filters, seed, previewOnly, context) => { last = { filters, seed, previewOnly, context }; return { eligible: filters.province?.includes('없는 지역') ? 0 : 9, personas: previewOnly ? [] : [profile] }; },
  browse: async (filters, page, pageSize, context) => { last = { filters, page, pageSize, context }; return { items: [profile], total: 9, page, pageSize }; },
};
before(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseService).useValue({})
    .overrideProvider(AuthService).useValue({ verify: async token => ({ id: token === 'own' ? owner : other, token }) })
    .overrideProvider(ConversationsService).useValue({ find: async (user, id) => { if (user.id !== owner || id !== chat) throw new NotFoundException(); return {}; } })
    .overrideProvider(PERSONA_SOURCE).useValue(source).compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
after(async () => { await app?.close(); });
const own = () => request(app.getHttpServer());
test('새 데이터 API 네 경로 모두 로그인·대화 소유권 확인', async () => {
  for (const [method, path] of [['get', '/facets'], ['post', '/preview'], ['post', '/search'], ['post', '/sample']]) {
    await own()[method](url + path).expect(401);
    await own()[method](url + path).set('Authorization', 'Bearer other').send({}).expect(404);
  }
});
test('선택지 쿼리는 직업 검색·페이지·복수 시도를 전달하고 기존 토큰 사용', async () => {
  const response = await own().get(url + '/facets?province=서울&province=경상남&occupationSearch=개발&page=2').set('Authorization', 'Bearer own').expect(200);
  assert.deepEqual(last.query.province, ['서울', '경상남']); assert.equal(last.query.page, 2); assert.equal(last.context.user.token, 'own'); assert.equal(last.context.conversationId, chat);
  assert.equal(response.body.values.income, undefined); assert.deepEqual(response.body.values.maritalStatus, ['미혼']);
  await own().get(url + '/facets?province=서울').set('Authorization', 'Bearer own').expect(200); assert.deepEqual(last.query.province, ['서울']);
  for (const query of ['page=0', 'page=1001', 'page=x', 'province=서울&province=서울', 'income=x', `occupationSearch=${'a'.repeat(101)}`]) await own().get(url + '/facets?' + query).set('Authorization', 'Bearer own').expect(400);
});
test('미리보기는 본문을 조회하지 않고 희소 표본과 JEV 없음 안내', async () => {
  const response = await own().post(url + '/preview').set('Authorization', 'Bearer own').send({ filters: { maritalStatus: ['미혼'], familyType: ['혼자 거주'] } }).expect(200);
  assert.equal(last.previewOnly, true); assert.equal(response.body.eligible, 9); assert.equal(response.body.jev, 0); assert.equal(response.body.warnings.length, 1); assert.equal(response.body.personas, undefined);
  const empty = await own().post(url + '/preview').set('Authorization', 'Bearer own').send({ filters: { province: ['없는 지역'] } }).expect(200); assert.equal(empty.body.selected, 0);
});
test('목록은 11종 실제 필터와 페이지 적용, 합성 이름과 본문 반환', async () => {
  const filters = Object.fromEntries(dimensions.map(key => [key, [profile[key]]]));
  const response = await own().post(url + '/search').set('Authorization', 'Bearer own').send({ filters, page: 2, pageSize: 10 }).expect(200);
  assert.deepEqual({ ...last.filters }, filters); assert.equal(last.page, 2); assert.equal(last.pageSize, 10); assert.equal(response.body.items[0].name, '김가람');
  await own().post(url + '/search').set('Authorization', 'Bearer own').send({}).expect(200); assert.equal(last.page, 1); assert.equal(last.pageSize, 20);
});
test('샘플은 seed 전달·생성하며 상세/JEV 배정을 반환', async () => {
  const response = await own().post(url + '/sample').set('Authorization', 'Bearer own').send({ seed: 'repeatable', filters: { district: ['서울-강서구'] } }).expect(200);
  assert.equal(last.seed, 'repeatable'); assert.equal(last.previewOnly, false); assert.equal(response.body.selected, 1); assert.equal(response.body.detail, 1);
  const generated = await own().post(url + '/sample').set('Authorization', 'Bearer own').send({}).expect(200); assert.match(generated.body.seed, /^[a-f0-9-]{36}$/);
});
test('제거된 소득·임의 키·잘못된 형식·최대 페이지 크기는 HTTP400', async () => {
  for (const body of [{ filters: { income: ['미상'] } }, { filters: { sex: ['여자', '여자'] } }, { filters: { district: [1] } }, { filters: { occupation: [''] } }, { filters: [] }, { filters: null }, { filters: { familyType: null } }, { ownerId: owner }, { page: 0 }, { page: '1' }, { page: null }, { pageSize: 51 }, { pageSize: 1.5 }]) await own().post(url + '/search').set('Authorization', 'Bearer own').send(body).expect(400);
  for (const seed of ['', 'a'.repeat(101), 12, null]) await own().post(url + '/sample').set('Authorization', 'Bearer own').send({ seed }).expect(400);
});
