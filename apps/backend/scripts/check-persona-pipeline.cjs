// 실제 Qwen과 운영 논쟁 서비스를 검증한다. 사용자 대화·Auth·DB 쓰기는 사용하지 않는다.
require('reflect-metadata');
const assert = require('node:assert/strict');
const { randomUUID, createHash } = require('node:crypto');
const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve, dirname } = require('node:path');
const { QwenDebateHttp, JevOpinionHttp } = require('../dist/debates/debate.http');
const { DebatesService } = require('../dist/debates/debates.service');
const { dimensions } = require('../dist/personas/persona.types');
const env = resolve(__dirname, '../../../.env'); if (existsSync(env)) process.loadEnvFile(env);
const fixturePath = process.argv[2], output = resolve(process.argv[3] || '.tmp/persona-live-report.json');
const withJev = process.argv.includes('--with-jev');
const { personaBudget } = require('../dist/personas/persona.policy');
const budget = personaBudget();
const personas = fixturePath ? JSON.parse(readFileSync(resolve(fixturePath), 'utf8').replace(/^\uFEFF/, '')) : [];
if (!Array.isArray(personas) || !personas.length || personas.length > (withJev ? budget.total : budget.detail) || !personas.every(p => typeof p.persona === 'string' && dimensions.every(key => typeof p[key] === 'string'))) throw Error(`실제 합성 페르소나 JSON 파일이 필요합니다. 현재 설정은 전체 최대${budget.total}명, 상세 단독 최대${budget.detail}명입니다.`);
const messages = [
  ['지연', '약속에 늦으면 벌금 5천 원을 내기로 했지만, 버스 사고로 늦은 경우에는 예외가 필요하다고 생각해.'],
  ['태은', '규칙을 지켜야 공정해. 불가피한 사유를 어떻게 확인할지도 먼저 정해야 해.'],
  ['지연', '사고 증빙이 있고 모두가 동의하면 면제할 수 있도록 기준을 정하자.'],
].map(([speaker, text], sequence) => ({ id: randomUUID(), participantId: null, speaker, text, sequence, kind: 'text', date: '2026-11-02', time: '15:00' }));
const user = { id: randomUUID(), token: 'synthetic-memory-only', email: null, providers: [] }, chatId = randomUUID();
const jobs = new Map(), timings = [], requests = [];
const originalFetch = global.fetch;
global.fetch = async (input, init) => {
  const body=init?.body?JSON.parse(init.body):null;
  const userContent=body?.messages?.[1]?.content;
  const opinionInput=body?.topic??(userContent?JSON.parse(userContent).topic:null);
  if(opinionInput){assert.equal('statements' in opinionInput,false);assert.deepEqual(opinionInput.evidenceMessageIds,[]);assert.ok(opinionInput.summary);}
  const begin = performance.now(), response = await originalFetch(input, init);
  const data = await response.clone().json().catch(() => null);
  requests.push({ path: new URL(String(input)).pathname, status: response.status, milliseconds: Math.round(performance.now() - begin),summaryOnlyOpinionInput:!!opinionInput,
    ...(data?.usage ? { usage: data.usage } : {}), ...(Number.isInteger(data?.count) ? { inputTokens: data.count, contextLimit: data.max_model_len } : {}),
    ...(data?.choices?.[0] ? { finishReason: data.choices[0].finish_reason } : {}),
    ...(data?.metadata?.device === 'cpu' ? { jevMetadata: data.metadata } : {}) });
  return response;
};
const qwen = new QwenDebateHttp();
const measure = async (stage, action, personaId) => {
  const begin = performance.now();
  try { const value = await action(); timings.push({ stage, personaId, milliseconds: Math.round(performance.now() - begin), status: 'completed' }); return value; }
  catch (error) { timings.push({ stage, personaId, milliseconds: Math.round(performance.now() - begin), status: 'failed', code: error.code || 'UNKNOWN' }); throw error; }
};
const ai = { ready: () => qwen.ready(), refine: (...args) => measure('refine', () => qwen.refine(...args)), respond: (...args) => measure('detail', () => qwen.respond(...args), args[1].id) };
const repo = {
  create: async (_user, id, conversationId, input, filters, speakerIds) => { const row = { id, conversationId, input, filters, speakerIds, revision: 0, document: null, status: 'pending', result: null, selected: 0, processed: 0 }; jobs.set(id, row); return { ...row }; },
  latest: async () => null, find: async (_user, id) => ({ ...jobs.get(id) }),
  review: async (_user, id, document) => Object.assign(jobs.get(id), { document, status: 'review', revision: 1 }),
  saveDocument: async (_user, id, revision, document) => { const row = jobs.get(id); assert.equal(revision, row.revision); Object.assign(row, { document, revision: revision + 1 }); return { ...row }; },
  claim: async (_user, id, revision) => { const row = jobs.get(id); assert.equal(revision, row.revision); Object.assign(row, { status: 'processing', stage: 'sampling' }); return { ...row }; },
  progress: async (_user, id, stage, processed, selected) => { Object.assign(jobs.get(id), { stage, processed, selected }); },
  finish: async (_user, id, result) => Object.assign(jobs.get(id), { status: 'completed', result }),
  fail: async (_user, id, errorCode) => Object.assign(jobs.get(id), { status: 'failed', errorCode }),
};
const source = { select: async () => ({ eligible: personas.length, personas }) };
const chats = { find: async () => ({ participants: [] }), messages: async () => ({ items: messages, total: messages.length, pageSize: 200 }) };
const realJev = withJev ? new JevOpinionHttp() : null;
const jev = realJev ? { ready: () => realJev.ready(), respond: (...args) => measure('jev', () => realJev.respond(...args), args[1].id) } : { ready: () => { throw Error('JEV should not be called'); }, respond: async () => { throw Error('JEV should not be called'); } };
const service = new DebatesService(repo, source, ai, jev, chats);
const report = { status: 'running', startedAt: new Date().toISOString(), fixtureSha256: createHash('sha256').update(JSON.stringify(personas)).digest('hex'), source: 'DB에서 추출한 합성 페르소나, 합성 대화, 실제 Qwen' + (withJev ? '/JEV-CPU' : '') + ', 메모리 작업 저장소', personaIds: personas.map(p => p.id), timings, requests };
async function waitUntil(id, statuses) {
  const deadline = performance.now() + (personas.length > budget.detail ? 3600000 : 600000); let previous = '';
  while (performance.now() < deadline) {
    const job = await service.find(user, id);
    const state = JSON.stringify({ status: job.status, stage: job.stage, processed: job.processed });
    if (state !== previous && (!job.processed || job.processed % 25 === 0 || statuses.includes(job.status) || job.status === 'failed')) { console.log(state); previous = state; }
    if (job.status === 'failed') throw Error('실제 추론 실패: ' + job.errorCode);
    if (statuses.includes(job.status)) return job;
    await new Promise(done => setTimeout(done, 250));
  }
  throw Error('실험 제한 시간 초과');
}
async function main() {
  const begin = performance.now();
  const created = await service.create(user, chatId, '불가피한 사정이 확인된 지각에는 벌금을 면제해야 할까?', {});
  const reviewed = await waitUntil(created.id, ['review']);
  report.document = reviewed.document;
  assert.equal(timings.filter(t => t.stage === 'detail').length, 0);
  await new Promise(setImmediate);
  const { question, proposition, context,summary, keyIssues, supportingLogic, opposingLogic, evidenceMessageIds } = reviewed.document;
  const saved = await service.saveDocument(user, created.id, { revision: reviewed.revision, question, proposition, context,summary, keyIssues, supportingLogic, opposingLogic, evidenceMessageIds });
  await service.start(user, created.id, saved.revision);
  const finished = await waitUntil(created.id, ['completed']);
  report.result = finished.result;
  assert.equal(finished.result.statistics.answered, personas.length);
  assert.equal(finished.result.jevTarget, Math.max(0, personas.length - budget.detail));
  assert.equal('statements' in finished.result.topic,false);assert.ok(finished.result.topic.summary);
  assert.ok(finished.result.responses.every(row => row.status === 'completed'));
  const countBefore = requests.length, sex = personas[0].sex;
  const filtered = await service.result(user, created.id, { sex: [sex] });
  assert.equal(filtered.statistics.selected, personas.filter(p => p.sex === sex).length);
  assert.equal(requests.length, countBefore);
  Object.assign(report, { status: 'passed', milliseconds: Math.round(performance.now() - begin), document: saved.document, result: finished.result, filtered: { sex, selected: filtered.statistics.selected } });
  console.log(JSON.stringify({ status: report.status, answered: finished.result.statistics.answered, detail: finished.result.detailTarget, jev: finished.result.jevTarget, milliseconds: report.milliseconds, distribution: finished.result.statistics.distribution }));
}
void main().catch(error => { report.status = 'failed'; report.error = error.message; console.error(error.message); process.exitCode = 1; })
  .finally(() => { service.onModuleDestroy(); global.fetch = originalFetch; mkdirSync(dirname(output), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2)); console.log('report: ' + output); });
