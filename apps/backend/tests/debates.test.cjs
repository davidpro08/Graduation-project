require('reflect-metadata');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { DebatesService } = require('../dist/debates/debates.service');
const { DebateError } = require('../dist/debates/debate.types');
const { editDocument, analysisTopic } = require('../dist/debates/debate.document');
const { aggregate, stance } = require('../dist/debates/debate.statistics');
const { validateOpinion, validateTopic, JevOpinionHttp, QwenDebateHttp } = require('../dist/debates/debate.http');
const user = { id: randomUUID(), token: 'synthetic', email: null, providers: [] };
const topic = { question: '지각 벌금에 예외가 필요한가?', proposition: '불가피한 지각에는 벌금을 면제해야 한다.', context: '합성 논쟁', evidenceMessageIds: [] };
const opinion = { agreement: 0.7, confidence: 0.8, opinion: '예외가 필요하다.', answer: '불가피한 사정을 고려해야 한다.' };
test('JEV-CPU는 승리 선택지의 조건부 확률·좌표·라벨을 검증하고 원래 점수를 보존', () => {
  const input = { agreement: 0.5, confidence: 0.6, opinion: '찬성', scoreKind: 'conditional_option_probability', optionProbabilities: [0.1, 0.1, 0.1, 0.6, 0.1] };
  assert.deepEqual(validateOpinion(input, false), input);
  for (const invalid of [{ ...input, confidence: 0.7 }, { ...input, agreement: 1 }, { ...input, opinion: '강한 찬성' }, { ...input, optionProbabilities: [0.1, 0.1, 0.1, 0.6] }, { ...input, optionProbabilities: [0.2, 0.2, 0.2, 0.6, 0.2] }, { ...input, scoreKind: 'accuracy' }]) assert.throws(() => validateOpinion(invalid, false));
  assert.throws(() => validateOpinion({ ...input, answer: '텍스트' }, true));
  const row = { persona: { id: 'a' }, mode: 'jev', status: 'completed', opinion: input };
  assert.equal(aggregate([row]).jevScoreKind, 'conditional_option_probability');
  assert.equal(aggregate([row, { ...row, opinion: { agreement: 0, confidence: 0.5, opinion: '중립' } }]).jevScoreKind, 'mixed');
});
function profile(i) { return { id: i.toString(16).padStart(32, '0'), age: 19 + i % 60, sex: i % 2 ? '여성' : '남성', province: i % 2 ? '서울특별시' : '경기도', education: '대학교 졸업', occupation: '합성 직업', income: '미상', ageGroup: '19-29', persona: '공개 합성 프로필' }; }
function fixture(size = 200, counts = { detail: 50, jev: 50 }) {
  const jobs = new Map(), calls = { detail: 0, jev: 0, refine: [], filters: null };
  const repo = {
    create: async (_user, id, conversationId, input, filters, speakerIds) => { const row = { id, conversationId, input, filters, speakerIds, revision: 0, document: null, status: 'pending', result: null, selected: 0, processed: 0 }; jobs.set(id, row); return { ...row }; },
    latest: async () => null, find: async (_user, id) => ({ ...jobs.get(id) }),
    history: async () => ({ items: [...jobs.values()], total: jobs.size }),
    review: async (_user, id, document) => Object.assign(jobs.get(id), { status: 'review', document, revision: 1 }),
    saveDocument: async (_user, id, revision, document) => { const row = jobs.get(id); assert.equal(revision, row.revision); Object.assign(row, { document, revision: revision + 1 }); return { ...row }; },
    claim: async (_user, id, revision) => { const row = jobs.get(id); assert.equal(revision, row.revision); Object.assign(row, { status: 'processing', stage: 'sampling' }); return { ...row }; },
    progress: async (_user, id, stage, processed, selected) => Object.assign(jobs.get(id), { status: 'processing', stage, processed, selected }),
    finish: async (_user, id, result) => Object.assign(jobs.get(id), { status: 'completed', result }),
    fail: async (_user, id, errorCode) => Object.assign(jobs.get(id), { status: 'failed', errorCode }),
  };
  const source = { facets: async () => ({}), select: async filters => { calls.filters = filters; return { eligible: size, personas: Array.from({ length: size }, (_, i) => profile(i)) }; } };
  const ai = { ready() {}, refine: async (_input, messages) => { calls.refine.push(...messages.map(m => m.id)); return topic; }, respond: async () => { calls.detail++; return { opinion, model: 'synthetic-qwen' }; } };
  const jev = { ready() {}, respond: async () => { calls.jev++; return { opinion: { ...opinion, answer: undefined }, model: 'synthetic-jev' }; } };
  const chats = { find: async () => ({}), messages: async () => ({ items: [], total: 0, pageSize: 200 }) };
  const keys = ['PERSONA_DETAIL_COUNT', 'PERSONA_JEV_COUNT'];
  const previous = keys.map(key => process.env[key]);
  process.env.PERSONA_DETAIL_COUNT = String(counts.detail); process.env.PERSONA_JEV_COUNT = String(counts.jev);
  try { return { service: new DebatesService(repo, source, ai, jev, chats), jobs, calls, repo, source, ai, jev, chats }; }
  finally { keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; }); }
}
async function finish(f) {
  const started = await f.service.create(user, randomUUID(), '불가피한 지각에도 벌금이 필요한가?', {});
  for (let i = 0; i < 200 && !['review', 'failed'].includes(f.jobs.get(started.id).status); i++) await new Promise(resolve => setTimeout(resolve, 2));
  if (f.jobs.get(started.id).status === 'review') {
    for (let i = 0; i < 200 && f.service.active.has(started.id); i++) await new Promise(resolve => setTimeout(resolve, 2));
    await f.service.start(user, started.id, f.jobs.get(started.id).revision);
  }
  for (let i = 0; i < 200; i++) { const job = f.jobs.get(started.id); if (['completed', 'failed'].includes(job.status)) return job; await new Promise(resolve => setTimeout(resolve, 2)); }
  throw Error('worker timeout');
}
test('후보 200명 중 중복 없는 상세50 + JEV50만 실행하고 100명 집계', async () => {
  const f = fixture(), job = await finish(f);
  assert.equal(job.status, 'completed'); assert.equal(f.calls.detail, 50); assert.equal(f.calls.jev, 50);
  assert.equal(job.result.detailTarget, 50); assert.equal(job.result.jevTarget, 50);
  assert.equal(job.result.selected, 100); assert.equal(job.result.eligible, 200);
  assert.equal(job.result.statistics.answered, 100); assert.equal(job.result.statistics.spectrum.length, 50);
  assert.equal(new Set(job.result.responses.map(row => row.persona.id)).size, 100);
  assert.ok(job.result.responses.every(row => !('persona' in row.persona)));
});
test('필터로 13명이면 상세13, JEV0이며 JEV 미설정이어도 실행', async () => {
  const f = fixture(13); f.jev.ready = () => { throw new DebateError('JEV_NOT_CONFIGURED'); };
  const job = await finish(f); assert.equal(job.status, 'completed'); assert.equal(f.calls.detail, 13); assert.equal(f.calls.jev, 0);
  assert.equal(job.result.statistics.jevAgreement, null); assert.equal(job.result.statistics.spectrum[0].alignment, null);
});
test('미리보기와 실행은 같은 설정을 적용하며 희소 표본은 상세50 우선', async () => {
  const f = fixture(70), filters = { province: ['서울특별시'], sex: ['여성'] };
  assert.deepEqual(await f.service.preview(user, randomUUID(), filters), { eligible: 70, selected: 70, detail: 50, jev: 20 });
  assert.deepEqual(f.calls.filters, filters);
  const job = await finish(f); assert.equal(job.result.detailTarget, 50); assert.equal(job.result.jevTarget, 20);
});

test('사용자 인원 설정은 미리보기·실행에 함께 적용하고 서비스 생성 후 유지', async () => {
  const f = fixture(200, { detail: 20, jev: 180 });
  assert.deepEqual(await f.service.preview(user, randomUUID(), {}), { eligible: 200, selected: 200, detail: 20, jev: 180 });
  const job = await finish(f); assert.equal(job.status, 'completed');
  assert.equal(f.calls.detail, 20); assert.equal(f.calls.jev, 180);
});

test('한쪽 인원 0이면 사용하지 않는 모델의 준비 검사·호출을 생략', async () => {
  for (const counts of [{ detail: 0, jev: 50 }, { detail: 50, jev: 0 }]) {
    const f = fixture(200, counts);
    let aiReady = 0;
    f.ai.ready = () => { aiReady++; if (counts.detail === 0 && aiReady > 1) throw Error('문서 생성 외 상세 모델 사용 금지'); };
    if (counts.jev === 0) f.jev.ready = () => { throw Error('사용하지 않는 의견 모델'); };
    const job = await finish(f); assert.equal(job.status, 'completed');
    assert.equal(aiReady, counts.detail === 0 ? 1 : 2);
    assert.equal(f.calls.detail, counts.detail); assert.equal(f.calls.jev, counts.jev);
  }
});
test('조건에 맞는 표본0과 중복 표본은 응답 생성 없이 실패', async () => {
  let f = fixture(0); assert.equal((await finish(f)).errorCode, 'NO_PERSONAS'); assert.equal(f.calls.detail, 0);
  f = fixture(2); f.source.select = async () => ({ eligible: 2, personas: [profile(1), profile(1)] });
  assert.equal((await finish(f)).errorCode, 'PERSONA_INVALID_SAMPLE');
});
test('JEV 미설정은 상세 모델로 대체 실행 없이 실패', async () => {
  const f = fixture(); f.jev.ready = () => { throw new DebateError('JEV_NOT_CONFIGURED'); };
  const job = await finish(f); assert.equal(job.errorCode, 'JEV_NOT_CONFIGURED'); assert.equal(f.calls.detail, 0); assert.equal(job.result, null);
});
test('개별 형식 오류는 실패로 집계하고 유효 응답만 분모로 사용', async () => {
  const f = fixture(4); let index = 0; f.ai.respond = async () => { if (index++ === 0) throw new DebateError('AI_INVALID_RESPONSE'); return { opinion, model: 'mock' }; };
  const job = await finish(f); assert.equal(job.status, 'completed'); assert.equal(job.result.statistics.answered, 3); assert.equal(job.result.statistics.failed, 1);
  assert.equal(job.result.statistics.distribution.reduce((sum, row) => sum + row.count, 0), 3);
});
test('전부 실패하면 완료로 표시하지 않고 서버 연결 장애는 전체 작업 실패', async () => {
  let f = fixture(4); f.ai.respond = async () => { throw new DebateError('AI_CONTEXT_ERROR'); };
  assert.equal((await finish(f)).errorCode, 'NO_VALID_RESPONSES');
  f = fixture(100); f.jev.respond = async () => { throw new DebateError('JEV_UNAVAILABLE'); };
  const job = await finish(f); assert.equal(job.status, 'failed'); assert.equal(job.errorCode, 'JEV_UNAVAILABLE'); assert.equal(job.result, null);
});
test('대화를 선택하지 않으면 자동 검색 없이 질문만 정리',async()=>{const f=fixture(1);f.chats.messages=async()=>{throw Error('자동 대화 검색 금지');};let seen;f.ai.refine=async(_input,messages)=>{seen=messages;return topic;};assert.equal((await finish(f)).status,'completed');assert.deepEqual(seen,[]);});
test('필터 재집계는 AND/OR 조건을 적용하고 실패와 응답수를 보존', () => {
  const responses = [0, 1, 2].map(i => ({ persona: profile(i), mode: 'detail', status: i === 2 ? 'failed' : 'completed', opinion: i === 2 ? undefined : opinion }));
  const stats = aggregate(responses, { sex: ['남성', '여성'], province: ['경기도'] });
  assert.equal(stats.selected, 2); assert.equal(stats.answered, 1); assert.equal(stats.failed, 1);
  assert.equal(aggregate(responses, { province: ['없는지역'] }).answered, 0);
});
test('JEV 신뢰도 가중 입장·스펙트럼 일치도 및 신뢰도0 계산', () => {
  const rows = [{ persona: profile(1), mode: 'detail', status: 'completed', opinion: { ...opinion, agreement: 1 } },
    { persona: profile(2), mode: 'jev', status: 'completed', opinion: { ...opinion, agreement: -1, confidence: 0.25 } },
    { persona: profile(3), mode: 'jev', status: 'completed', opinion: { ...opinion, agreement: 1, confidence: 0.75 } }];
  let stats = aggregate(rows); assert.equal(stats.jevAgreement, 0.5); assert.equal(stats.spectrum[0].alignment, 0.75);
  rows[1].opinion.confidence = 0; rows[2].opinion.confidence = 0;
  stats = aggregate(rows); assert.equal(stats.jevAgreement, null); assert.equal(stats.spectrum[0].alignment, null);
  assert.deepEqual([-1, -0.6, -0.2, 0, 0.2, 0.6, 1].map(stance), [0, 0, 2, 2, 2, 4, 4]);
});
test('위조 근거·비정상 수치·빈 답변을 거절하고 JEV에는 상세 답변을 보존하지 않음', () => {
  for (const agreement of [NaN, Infinity, -1.1, '0.5']) assert.throws(() => validateOpinion({ ...opinion, agreement }, true));
  for (const confidence of [-0.1, 1.1, null]) assert.throws(() => validateOpinion({ ...opinion, confidence }, true));
  assert.throws(() => validateOpinion({ ...opinion, answer: '' }, true));
  assert.equal('answer' in validateOpinion(opinion, false), false);
  assert.throws(() => validateTopic({ ...topic, evidenceMessageIds: ['forged'] }, new Set()));
});
test('중단 작업 복구와 조회 토큰 갱신', async () => {
  const f = fixture(1), id = randomUUID(); f.jobs.set(id, { id, status: 'processing' });
  assert.equal((await f.service.find(user, id)).errorCode, 'JOB_INTERRUPTED');
  let release, entered, token;
  const waiting = new Promise(resolve => { release = resolve; }), started = new Promise(resolve => { entered = resolve; });
  f.ai.respond = async () => { entered(); await waiting; return { opinion, model: 'mock' }; };
  const original = f.repo.finish; f.repo.finish = async (worker, ...args) => { token = worker.token; return original(worker, ...args); };
  const job = await f.service.create(user, randomUUID(), '논쟁', {});
  for (let i = 0; i < 200 && (f.jobs.get(job.id).status !== 'review' || f.service.active.has(job.id)); i++) await new Promise(resolve => setTimeout(resolve, 2));
  await f.service.start(user, job.id, 1); await started;
  await f.service.find({ ...user, token: 'refreshed' }, job.id); release();
  for (let i = 0; i < 200 && f.jobs.get(job.id).status !== 'completed'; i++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(token, 'refreshed');
});
test('문서 생성은 검토 상태에서 멈추며 페르소나·JEV를 호출하지 않음', async () => {
  const f = fixture(); let sampled = 0; f.source.select = async () => { sampled++; throw Error('unexpected sampling'); };
  f.jev.ready = () => { throw new DebateError('JEV_NOT_CONFIGURED'); };
  const job = await f.service.create(user, randomUUID(), '문서를 먼저 만들어 줘', {});
  for (let i = 0; i < 200 && f.jobs.get(job.id).status !== 'review'; i++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(f.jobs.get(job.id).status, 'review'); assert.equal(sampled, 0); assert.equal(f.calls.detail, 0); assert.equal(f.calls.jev, 0);
  assert.ok(f.jobs.get(job.id).document.keyIssues.length);
});
test('발언자 필터는 실제 대화 참여자만 허용하고 발언 근거는 원문에서 연결', async () => {
  const f = fixture(1), a = randomUUID(), b = randomUUID(), chat = randomUUID();
  f.chats.find = async () => ({ participants: [{ id: a, name: '참여자A' }, { id: b, name: '참여자B' }] });
  f.chats.messages = async () => ({ items: [{ id: 'm-a', participantId: a, speaker: '참여자A', text: '예외가 필요합니다. 논쟁', kind: 'text' }, { id: 'm-b', participantId: b, speaker: '참여자B', text: '예외에 반대합니다. 논쟁', kind: 'text' }], total: 2, pageSize: 200 });
  f.ai.refine = async (_input, messages) => { assert.ok(messages.every(row => row.participantId === a)); return { ...topic, evidenceMessageIds: messages.map(row => row.id) }; };
  await assert.rejects(f.service.create(user, chat, '논쟁', {}, [randomUUID()]), error => error.getStatus() === 400);
  f.chats.selectedMessages=async()=>[{id:'m-a',participantId:a,speaker:'참여자A',text:'예외가 필요합니다. 논쟁',kind:'text'}];
  const job = await f.service.create(user, chat, '논쟁', {}, [a],['m-a']);
  for (let i = 0; i < 200 && f.jobs.get(job.id).status !== 'review'; i++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.deepEqual(f.jobs.get(job.id).document.statements, [{ messageId: 'm-a', participantId: a, speaker: '참여자A', text: '예외가 필요합니다. 논쟁' }]);
});
test('수정 문서는 실제 발언의 화자·본문을 유지하고 제외한 근거를 추론 입력에서 제거', () => {
  const document = { ...topic, evidenceMessageIds: ['m1'], keyIssues: ['공정성'], supportingLogic: [], opposingLogic: [], statements: [{ messageId: 'm1', participantId: 'a', speaker: 'A', text: '실제 발언' }] };
  const edited = editDocument(document, { ...document, revision: 1, question: '수정한 쟁점', evidenceMessageIds: [] });
  assert.equal(edited.statements[0].text, '실제 발언'); assert.equal('statements' in analysisTopic(edited), false);assert.deepEqual(analysisTopic(edited).evidenceMessageIds,[]);
  assert.throws(() => editDocument(document, { ...document, revision: 1, evidenceMessageIds: ['forged'] }));
});
test('학교 JEV 제안 계약은 버전·페르소나ID·모델·숫자와 인증을 검증', async () => {
  const previous = global.fetch, url = process.env.JEV_OPINIONS_URL, key = process.env.JEV_OPINIONS_API_KEY;
  process.env.JEV_OPINIONS_URL = 'http://school.example/opinions'; process.env.JEV_OPINIONS_API_KEY = 'synthetic-key';
  const ai = new JevOpinionHttp(), persona = profile(1), signal = new AbortController().signal;
  try {
    global.fetch = async (target, options) => { assert.equal(target, process.env.JEV_OPINIONS_URL); assert.equal(options.headers.Authorization, 'Bearer synthetic-key'); const body = JSON.parse(options.body); assert.equal(body.persona.id, persona.id); assert.ok(!options.body.includes('synthetic-key')); return new Response(JSON.stringify({ version: 'persona-opinion-v1', personaId: persona.id, model: 'synthetic-jev', opinion })); };
    assert.equal((await ai.respond(topic, persona, signal)).model, 'synthetic-jev');
    global.fetch = async () => new Response(JSON.stringify({ version: 'persona-opinion-v1', personaId: 'wrong', model: 'jev', opinion }));
    await assert.rejects(ai.respond(topic, persona, signal), error => error.code === 'JEV_INVALID_RESPONSE');
    global.fetch = async () => new Response('{}', { status: 401 });
    await assert.rejects(ai.respond(topic, persona, signal), error => error.code === 'JEV_AUTH_ERROR');
  } finally { global.fetch = previous; if (url === undefined) delete process.env.JEV_OPINIONS_URL; else process.env.JEV_OPINIONS_URL = url; if (key === undefined) delete process.env.JEV_OPINIONS_API_KEY; else process.env.JEV_OPINIONS_API_KEY = key; }
});
test('Qwen 응답은 토큰 확인 후 실행하며 초과 컨텍스트와 잘린 응답을 거절', async () => {
  const previous = global.fetch, ai = new QwenDebateHttp(), signal = new AbortController().signal;
  try {
    global.fetch = async target => new Response(JSON.stringify(String(target).endsWith('/tokenize') ? { count: 10, max_model_len: 2048 } : { model: 'qwen', choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(opinion) } }] }));
    assert.equal((await ai.respond(topic, profile(1), signal)).opinion.answer, opinion.answer);
    global.fetch = async () => new Response(JSON.stringify({ count: 2000, max_model_len: 2048 }));
    await assert.rejects(ai.respond(topic, profile(1), signal), error => error.code === 'AI_CONTEXT_ERROR');
    global.fetch = async target => new Response(JSON.stringify(String(target).endsWith('/tokenize') ? { count: 10, max_model_len: 2048 } : { model: 'qwen', choices: [{ finish_reason: 'length', message: { content: '{}' } }] }));
    await assert.rejects(ai.respond(topic, profile(1), signal), error => error.code === 'AI_INVALID_RESPONSE');
  } finally { global.fetch = previous; }
});

test('미완성 서버 문서 틀로 의견을 다시 요청하지 않음',async()=>{const f=fixture(1),id=randomUUID();f.jobs.set(id,{id,status:'failed',document:{draftOnly:true},conversationId:randomUUID()});await assert.rejects(f.service.restart(user,id,'opinions'),e=>e.getStatus()===400);assert.equal(f.calls.detail,0);});

test('상세 응답 완료를 기다리지 않고 JEV 작업도 시작',async()=>{const f=fixture(51);let release;const jevStarted=new Promise(resolve=>{release=resolve;});f.ai.respond=async()=>{await jevStarted;return {opinion,model:'synthetic-qwen'};};f.jev.respond=async()=>{release();return {opinion,model:'synthetic-jev'};};const job=await finish(f);assert.equal(job.status,'completed');assert.equal(job.result.statistics.answered,51);});
