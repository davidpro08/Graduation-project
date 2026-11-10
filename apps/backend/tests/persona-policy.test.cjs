require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { personaBudget } = require('../dist/personas/persona.policy');
const { PersonasService } = require('../dist/personas/personas.service');

test('기본 인원은 상세50·JEV50이고 합계200까지 각각 설정 가능', () => {
  assert.deepEqual(personaBudget({}), { detail: 50, jev: 50, total: 100 });
  assert.deepEqual(personaBudget({ PERSONA_DETAIL_COUNT: '20', PERSONA_JEV_COUNT: '180' }), { detail: 20, jev: 180, total: 200 });
  assert.deepEqual(personaBudget({ PERSONA_DETAIL_COUNT: '200', PERSONA_JEV_COUNT: '0' }), { detail: 200, jev: 0, total: 200 });
});

test('잘못된 환경 설정을 조용히 보정하지 않고 거절', () => {
  for (const value of ['', ' ', '-1', '1.5', 'x', '1e2', '201', '9007199254740992']) {
    for (const key of ['PERSONA_DETAIL_COUNT', 'PERSONA_JEV_COUNT']) assert.throws(() => personaBudget({ [key]: value }), /정수/);
  }
  for (const counts of [['0', '0'], ['101', '100']]) assert.throws(() => personaBudget({ PERSONA_DETAIL_COUNT: counts[0], PERSONA_JEV_COUNT: counts[1] }), /합계/);
});

test('페르소나 미리보기와 샘플 API가 설정 상한과 희소 표본을 동일하게 반영', async () => {
  const keys = ['PERSONA_DETAIL_COUNT', 'PERSONA_JEV_COUNT'], previous = keys.map(key => process.env[key]);
  process.env.PERSONA_DETAIL_COUNT = '30'; process.env.PERSONA_JEV_COUNT = '10';
  let size = 200;
  const source = { select: async (_filters, _seed, preview) => ({ eligible: size, personas: preview ? [] : Array.from({ length: size }, (_, id) => ({ id })) }) };
  try {
    const service = new PersonasService(source, { find: async () => ({}) });
    for (size of [200, 35, 13, 0]) {
      const preview = await service.preview({}, 'chat', {}), sample = await service.sample({}, 'chat', {}, 'seed');
      assert.equal(sample.personas.length, Math.min(40, size)); assert.equal(sample.eligible, size);
      for (const key of ['selected', 'detail', 'jev']) assert.equal(sample[key], preview[key]);
      assert.equal(sample.detail, Math.min(30, size)); assert.equal(sample.jev, Math.max(0, Math.min(40, size) - 30));
    }
  } finally { keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
});
