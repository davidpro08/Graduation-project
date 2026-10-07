const { after, test } = require('node:test');
const assert = require('node:assert/strict');
const { Test } = require('@nestjs/testing');
const { noul, choice, score } = require('@typesafe-ai/sdk');
const { AiModule } = require('../dist/ai/ai.module');
const { JEV_CONFIG, readJevConfig } = require('../dist/ai/jev.config');
const { JEV_CLIENT } = require('../dist/ai/jev.client');
const { JevService } = require('../dist/ai/jev.service');

const originalFetch = global.fetch;
after(() => { global.fetch = originalFetch; });
const config = { enabled: true, apiKey: 'synthetic-test-key', model: 'jev-test', timeoutMs: 500 };
const input = { state: { text: '참여자A: 금요일 오후 3시에 만나자.' },
  questions: { hasSchedule: noul('일정에 대한 언급이 있나요?') } };
const answer = { model: 'jev-test', answers: { hasSchedule: { type: 'noul', noul: 0.9 } },
  usage: { input_tokens: 10, output_tokens: 0 } };
async function withService(settings, fetch, run) {
  global.fetch = fetch;
  const moduleRef = await Test.createTestingModule({ imports: [AiModule] })
    .overrideProvider(JEV_CONFIG).useValue(settings).compile();
  try { await run(moduleRef.get(JevService)); }
  finally { await moduleRef.close(); global.fetch = originalFetch; }
}

test('설정 기본값·활성화 키·불리언·시간 제한을 검증한다', () => {
  assert.deepEqual(readJevConfig({}), { enabled: false, apiKey: undefined, model: 'jev-latest', timeoutMs: 5000 });
  assert.equal(readJevConfig({ JEV_ENABLED: 'true', TYPESAFE_API_KEY: ' test ' }).apiKey, 'test');
  for (const env of [{ JEV_ENABLED: 'yes' }, { JEV_ENABLED: 'true' },
    { JEV_ENABLED: 'true', TYPESAFE_API_KEY: '  ' }, ...['0', '-1', '1.5', 'NaN', '60001', '1e3']
      .map(JEV_TIMEOUT_MS => ({ JEV_TIMEOUT_MS }))]) assert.throws(() => readJevConfig(env));
});

test('전역 비활성화는 키 없이 동작하고 호출별 true로 우회할 수 없다', async () => {
  await withService(readJevConfig({}), () => { assert.fail('API를 호출하면 안 됨'); }, async service => {
    assert.deepEqual(await service.evaluate(input), { used: false, reason: 'disabled' });
    assert.deepEqual(await service.evaluate(input, { useJev: true }), { used: false, reason: 'disabled' });
  });
});

test('활성화 상태에서도 useJev=false 요청은 API를 호출하지 않는다', async () => {
  await withService(config, () => { assert.fail('API를 호출하면 안 됨'); }, async service => {
    assert.deepEqual(await service.evaluate(input, { useJev: false }), { used: false, reason: 'request-disabled' });
  });
});

test('실제 SDK의 인증·모델·질문 형식과 동시 요청의 독립 분기를 검증한다', async () => {
  let calls = 0;
  await withService(config, async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.typesafe.ai/v1/systemone');
    assert.equal(init.method, 'POST');
    assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer synthetic-test-key');
    assert.deepEqual(JSON.parse(init.body), JSON.parse(JSON.stringify({ ...input, model: 'jev-test' })));
    return Response.json(answer);
  }, async service => {
    const results = await Promise.all([service.evaluate(input), service.evaluate(input, { useJev: false })]);
    assert.deepEqual(results, [{ used: true, result: answer }, { used: false, reason: 'request-disabled' }]);
    assert.equal(calls, 1);
  });
});

test('401·429·503과 연결 실패는 재시도 없이 안전한 우회 결과를 반환한다', async () => {
  for (const status of [401, 429, 503, 'connection']) {
    let calls = 0;
    await withService(config, async () => {
      calls++;
      if (status === 'connection') throw new Error('private conversation and key');
      return Response.json({ error: 'private conversation and key' }, { status });
    }, async service => {
      assert.deepEqual(await service.evaluate(input), { used: false, reason: 'unavailable',
        errorCode: status === 'connection' ? 'JEV_CONNECTION_ERROR' : 'JEV_API_ERROR' });
      assert.equal(calls, 1);
    });
  }
});

test('응답 지연은 제한 시간에 중단되고 LLM 우회 사유를 반환한다', async () => {
  let aborted = false;
  await withService({ ...config, timeoutMs: 20 }, (_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true });
  }), async service => {
    assert.deepEqual(await service.evaluate(input), { used: false, reason: 'unavailable', errorCode: 'JEV_TIMEOUT' });
    assert.equal(aborted, true);
  });
});

test('빈 결과·잘못된 JSON·확률·타입은 판단 결과로 사용하지 않는다', async () => {
  for (const response of [null, {}, { ...answer, answers: {} }, { ...answer, usage: {} },
    { ...answer, answers: { hasSchedule: { type: 'noul', noul: 2 } } },
    { ...answer, answers: { hasSchedule: { type: 'choice', choice: 'yes' } } }, 'invalid-json']) {
    await withService(config, async () => response === 'invalid-json'
      ? new Response('{broken', { headers: { 'Content-Type': 'application/json' } })
      : Response.json(response), async service => {
      assert.deepEqual(await service.evaluate(input), {
        used: false, reason: 'unavailable', errorCode: 'JEV_INVALID_RESPONSE',
      });
    });
  }
});

test('Choice·Score 응답은 질문의 선택지·점수 범위를 검증한다', async () => {
  const request = { state: '합성 텍스트', questions: {
    category: choice('분류', { schedule: null, other: null }),
    relevance: score('관련성', ['없음', '있음']),
  } };
  const result = { model: 'jev-test', usage: answer.usage, answers: {
    category: { type: 'choice', choice: 'schedule', confidence: 0.8, probabilities: { schedule: 0.9, other: 0.1 } },
    relevance: { type: 'score', score: 0.9, confidence: 0.8, legend: { 0: '없음', 1: '있음' }, probabilities: { 0: 0.1, 1: 0.9 } },
  } };
  await withService(config, async () => Response.json(result), async service => {
    assert.equal((await service.evaluate(request)).used, true);
    result.answers.category.choice = 'unlisted';
    assert.equal((await service.evaluate(request)).errorCode, 'JEV_INVALID_RESPONSE');
    result.answers.category.choice = 'schedule';
    result.answers.relevance.score = 2;
    assert.equal((await service.evaluate(request)).errorCode, 'JEV_INVALID_RESPONSE');
  });
});

test('잘못된 내부 요청은 오류 코드로 구분하고 예상 밖 구현 오류를 숨기지 않는다', async () => {
  await withService(config, () => { assert.fail('빈 질문은 전송하면 안 됨'); }, async service => {
    assert.equal((await service.evaluate({ state: null, questions: {} })).errorCode, 'JEV_INVALID_REQUEST');
  });
  const moduleRef = await Test.createTestingModule({ imports: [AiModule] })
    .overrideProvider(JEV_CONFIG).useValue(config)
    .overrideProvider(JEV_CLIENT).useValue({ evaluate: () => { throw new Error('implementation bug'); } }).compile();
  try { await assert.rejects(moduleRef.get(JevService).evaluate(input), /implementation bug/); }
  finally { await moduleRef.close(); }
});
