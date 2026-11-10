require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SupabasePersonaSource } = require('../dist/personas/supabase-persona.source');
const { dimensions } = require('../dist/personas/persona.types');
const context = { user: { id: 'synthetic-user', token: 'user-jwt' }, conversationId: 'synthetic-chat' };
function adapter(result) { let call; const source = new SupabasePersonaSource({ forUser(token) { assert.equal(token, 'user-jwt'); return { rpc: async (name, params) => { call = { name, params }; return result; } }; } }); return { source, call: () => call }; }
test('관리자 키 없이 사용자 JWT·대화·필터·seed를 제한된 RPC에 전달', async () => {
  const f = adapter({ data: { eligible: 9, personas: [] } });
  await f.source.select({ sex: ['여자'] }, 'seed', true, context);
  assert.deepEqual(f.call(), { name: 'query_persona_data', params: { p_conversation_id: 'synthetic-chat', p_action: 'count', p_filters: { sex: ['여자'] }, p_options: { seed: 'seed' } } });
});
test('권한 오류는404, DB·형식 오류는503으로 원문 오류 비공개', async () => {
  await assert.rejects(adapter({ error: { code: '42501', message: 'secret' } }).source.select({}, 's', true, context), error => error.getStatus() === 404 && !error.message.includes('secret'));
  await assert.rejects(adapter({ error: { code: 'XX000', message: 'secret' } }).source.select({}, 's', true, context), error => error.getStatus() === 503 && !error.message.includes('secret'));
  for (const data of [{ eligible: -1, personas: [] }, { eligible: 1, personas: [{ id: 'bad' }] }, { eligible: 1, personas: Array(501).fill({}) }]) await assert.rejects(adapter({ data }).source.select({}, 's', false, context), error => error.getStatus() === 503);
});
test('선택지 모든 차원과 목록의 실제 프로필 형식을 검증', async () => {
  const values = Object.fromEntries(dimensions.map(key => [key, []]));
  const facets = { values, occupation: { total: 0, page: 1, pageSize: 50, search: '' }, population: 0, age: { min: null, max: null } };
  assert.deepEqual(await adapter({ data: facets }).source.facets(context), facets);
  delete values.familyType; await assert.rejects(adapter({ data: facets }).source.facets(context), error => error.getStatus() === 503);
  await assert.rejects(adapter({ data: { items: [{ id: 'bad' }], total: 1 } }).source.browse({}, 1, 20, context), error => error.getStatus() === 503);
});
