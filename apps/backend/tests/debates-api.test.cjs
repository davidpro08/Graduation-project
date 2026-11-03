require('reflect-metadata');
const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Test } = require('@nestjs/testing');
const { NotFoundException, ConflictException } = require('@nestjs/common');
const request = require('supertest');
const { AppModule } = require('../dist/app.module');
const { configureApp } = require('../dist/configure-app');
const { SupabaseService } = require('../dist/supabase/supabase.service');
const { AuthService } = require('../dist/auth/auth.service');
const { ConversationsService } = require('../dist/conversations/conversations.service');
const { DEBATE_REPO, DEBATE_AI, PERSONA_SOURCE, JEV_OPINIONS, DOCUMENT_RESEARCH } = require('../dist/debates/debate.types');
const owner = randomUUID(), other = randomUUID(), conversation = randomUUID(), jobs = new Map();
let app, calls = 0, created;
const repo = {
  create: async (user, id, conversationId, input, filters, speakerIds) => { const row = { id, owner: user.id, conversationId, input, filters, speakerIds, revision: 0, document: null, status: 'pending', result: null }; jobs.set(id, row); return { ...row }; },
  find: async (user, id) => { const row = jobs.get(id); if (row?.owner !== user.id) throw new NotFoundException(); return { ...row }; },
  latest: async user => [...jobs.values()].filter(row => row.owner === user.id).at(-1) ?? null,
  history: async (user, _conversation, page) => ({ items: [...jobs.values()].filter(row => row.owner === user.id).slice((page - 1) * 20, page * 20), total: [...jobs.values()].filter(row => row.owner === user.id).length }),
  review: async (_user, id, document) => Object.assign(jobs.get(id), { status: 'review', document, revision: 1 }),
  saveDocument: async (_user, id, revision, document) => { const row = jobs.get(id); if (row.revision !== revision || row.status !== 'review') throw new ConflictException(); Object.assign(row, { document, revision: revision + 1 }); return { ...row }; },
  claim: async (_user, id, revision) => { const row = jobs.get(id); if (row.revision !== revision || row.status !== 'review') throw new ConflictException(); Object.assign(row, { status: 'processing', stage: 'sampling' }); return { ...row }; },
  progress: async (_user, id, stage, processed, selected) => Object.assign(jobs.get(id), { status: 'processing', stage, processed, selected }),
  finish: async (_user, id, result) => Object.assign(jobs.get(id), { status: 'completed', result }),
  fail: async (_user, id, errorCode) => Object.assign(jobs.get(id), { status: 'failed', errorCode }),
};
before(async () => {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseService).useValue({})
    .overrideProvider(AuthService).useValue({ verify: async token => ({ id: token === 'own' ? owner : other, token }) })
    .overrideProvider(ConversationsService).useValue({ find: async (user, id) => { if (user.id !== owner || id !== conversation) throw new NotFoundException(); return {}; }, messages: async () => ({ items: [], total: 0, pageSize: 200 }) })
    .overrideProvider(DOCUMENT_RESEARCH).useValue({collect:async queries=>({status:queries.length?'failed':'not_needed',queries,sources:[],findings:[],errors:queries.length?['SEARCH_NO_RESULTS']:[]})})
    .overrideProvider(DEBATE_REPO).useValue(repo)
    .overrideProvider(PERSONA_SOURCE).useValue({ facets: async () => ({ values: { sex: ['남성', '여성'], province: [], ageGroup: [], education: [], occupation: [], maritalStatus: [] } }),
      select: async filters => ({ eligible: filters.sex?.includes('여성') ? 1 : 2, personas: [0, 1].filter(i => !filters.sex?.length || filters.sex.includes(i ? '여성' : '남성')).map(i => ({ id: `${i}`.padStart(32, '0'), age: 30, sex: i ? '여성' : '남성', province: '서울특별시', education: '대학교', occupation: '합성 직업', income: '미상', ageGroup: '30-39', persona: '합성 요약' })) }) })
    .overrideProvider(DEBATE_AI).useValue({ ready() {}, refine: async () => ({ question: '합성 논쟁', proposition: '예외가 필요하다', context: '합성 맥락', evidenceMessageIds: [] }), respond: async () => { calls++; return { opinion: { agreement: 0.8, confidence: 0.9, opinion: '예외 찬성', answer: '상황을 고려해야 한다.' }, model: 'synthetic-qwen' }; } })
    .overrideProvider(JEV_OPINIONS).useValue({ ready() {}, respond: async () => { throw Error('unexpected JEV'); } })
    .compile();
  app = module.createNestApplication(); configureApp(app); await app.init();
});
after(async () => { await app?.close(); });
const own = () => request(app.getHttpServer());
const url = `/api/conversations/${conversation}/persona-debates`;
const documentEdit=()=>{const {question,proposition,context,summary,keyIssues,supportingLogic,opposingLogic,evidenceMessageIds}=jobs.get(created).document;return {question,proposition,context,summary,keyIssues,supportingLogic,opposingLogic,evidenceMessageIds,revision:1};};
test('페르소나 API는 인증·대화 소유권을 확인하고 초기 조회는 {job:null}', async () => {
  await own().get(url).expect(401);
  await own().get(url).set('Authorization', 'Bearer other').expect(404);
  await own().get(url).set('Authorization', 'Bearer own').expect(200).expect({ job: null });
  await own().get(`${url}/facets`).set('Authorization', 'Bearer other').expect(404);
});
test('평문·중첩 필터·임의 사용자ID·중복·배열·허용치 초과를 검증', async () => {
  for (const body of [{ input: ' ' }, { input: '가'.repeat(801) }, { input: '논쟁', ownerId: other }, { input: '논쟁', filters: { unknown: ['x'] } },
    { input: '논쟁', filters: { sex: ['남성', '남성'] } }, { input: '논쟁', filters: { sex: '남성' } }, { input: '논쟁', filters: [] },{input:'논쟁',messageIds:Array.from({length:21},()=>randomUUID())},{input:'논쟁',messageIds:['bad-id']},{input:'논쟁',messageIds:[conversation,conversation]}, { input: '논쟁', filters: { province: [1] } }]) {
    await own().post(url).set('Authorization', 'Bearer own').send(body).expect(400);
  }
  await own().post(url).set('Authorization', 'Bearer other').send({ input: '논쟁' }).expect(404);
});
test('필터 선택지와 1명 표본 미리보기에는 모델 호출 없음', async () => {
  const facets = await own().get(`${url}/facets`).set('Authorization', 'Bearer own').expect(200); assert.deepEqual(facets.body.maritalStatus, []); assert.equal(facets.body.income, undefined);
  const preview = await own().post(`${url}/preview`).set('Authorization', 'Bearer own').send({ filters: { sex: ['여성'] } }).expect(200);
  assert.deepEqual(preview.body, { eligible: 1, selected: 1, detail: 1, jev: 0 }); assert.equal(calls, 0);
});
test('202 문서 생성·검토 상태·새로고침 복원·타인 문서 차단', async () => {
  const response = await own().post(url).set('Authorization', 'Bearer own').send({ input: '예외가 필요한가?', filters: {} }).expect(202);
  created = response.body.id;
  for (let i = 0; i < 200 && jobs.get(created).status !== 'review'; i++) await new Promise(resolve => setTimeout(resolve, 2));
  const latest = await own().get(url).set('Authorization', 'Bearer own').expect(200); assert.equal(latest.body.job.status, 'review'); assert.equal(calls, 0);
  await own().get(`/api/persona-debates/${created}`).set('Authorization', 'Bearer other').expect(404);
  await own().post(`/api/persona-debates/${created}/result`).set('Authorization', 'Bearer other').send({}).expect(404);
  await own().patch(`/api/persona-debates/${created}/document`).set('Authorization', 'Bearer other').send(documentEdit()).expect(404);
  await own().post(`/api/persona-debates/${created}/run`).set('Authorization', 'Bearer other').send({ revision: 1 }).expect(404);
});
test('문서 수정·낙관적 버전 충돌·명시적 분석 시작·중복 시작 차단', async () => {
  const edit = { ...documentEdit(),summary:'수정한 대화 핵심 요약',question: '수정한 핵심 쟁점' };
  await own().patch(`/api/persona-debates/${created}/document`).set('Authorization', 'Bearer own').send({ ...edit, evidenceMessageIds: ['forged'] }).expect(400);
  const saved = await own().patch(`/api/persona-debates/${created}/document`).set('Authorization', 'Bearer own').send(edit).expect(200);
  assert.equal(saved.body.revision, 2); assert.equal(saved.body.document.question, '수정한 핵심 쟁점'); assert.equal(calls, 0);
  assert.equal(saved.body.document.summary,'수정한 대화 핵심 요약');
  await own().patch(`/api/persona-debates/${created}/document`).set('Authorization', 'Bearer own').send(edit).expect(409);
  await own().post(`/api/persona-debates/${created}/run`).set('Authorization', 'Bearer own').send({ revision: 1 }).expect(409);
  await own().post(`/api/persona-debates/${created}/run`).set('Authorization', 'Bearer own').send({ revision: 2 }).expect(202);
  for (let i = 0; i < 200 && jobs.get(created).status !== 'completed'; i++) await new Promise(resolve => setTimeout(resolve, 2));
  assert.equal(jobs.get(created).status, 'completed'); assert.equal(jobs.get(created).result.topic.question, '수정한 핵심 쟁점');
  await own().post(`/api/persona-debates/${created}/run`).set('Authorization', 'Bearer own').send({ revision: 2 }).expect(409);
  await own().patch(`/api/persona-debates/${created}/document`).set('Authorization', 'Bearer own').send({ ...edit, revision: 2 }).expect(409);
});
test('분석별 기록 조회는 소유권·페이지를 검증하고 완료 결과도 유지', async () => {
  const history = await own().get(`${url}/history?page=1`).set('Authorization', 'Bearer own').expect(200); assert.equal(history.body.items[0].id, created);
  await own().get(`${url}/history?page=0`).set('Authorization', 'Bearer own').expect(400);
  await own().get(`${url}/history`).set('Authorization', 'Bearer other').expect(404);
});
test('저장된 결과 재필터는 모델 재호출 없이 1명/빈 결과 집계', async () => {
  const before = calls;
  const filtered = await own().post(`/api/persona-debates/${created}/result`).set('Authorization', 'Bearer own').send({ filters: { sex: ['여성'] } }).expect(200);
  assert.equal(filtered.body.statistics.answered, 1);
  const empty = await own().post(`/api/persona-debates/${created}/result`).set('Authorization', 'Bearer own').send({ filters: { province: ['없는지역'] } }).expect(200);
  assert.equal(empty.body.statistics.answered, 0); assert.equal(calls, before);
});
test('Swagger에 별도 분석 경로를 제공하고 잘못된 UUID를 거절', async () => {
  const docs = await own().get('/api/docs-json').expect(200); assert.ok(docs.body.paths['/api/conversations/{id}/persona-debates']);
  await own().get('/api/persona-debates/invalid').set('Authorization', 'Bearer own').expect(400);
});

test('다시시작 API는 로그인·소유권·모드·실패 상태를 검증',async()=>{
 const path=`/api/persona-debates/${created}/restart`;
 await own().post(path).send({mode:'document'}).expect(401);
 await own().post(path).set('Authorization','Bearer other').send({mode:'document'}).expect(404);
 for(const body of [{},{mode:'unknown'},{mode:'document',ownerId:other}])await own().post(path).set('Authorization','Bearer own').send(body).expect(400);
 await own().post(path).set('Authorization','Bearer own').send({mode:'document'}).expect(409);
});
test('실패한 의견 요청은 저장 문서·필터를 보존한 새 작업으로 다시시작',async()=>{
 const original=jobs.get(created);original.status='failed';original.errorCode='AI_REQUEST_TIMEOUT';
 const doc=JSON.stringify(original.document),filters=JSON.stringify(original.filters);
 const response=await own().post(`/api/persona-debates/${created}/restart`).set('Authorization','Bearer own').send({mode:'opinions'}).expect(202);
 assert.notEqual(response.body.id,created);assert.equal(original.status,'failed');assert.equal(original.errorCode,'AI_REQUEST_TIMEOUT');assert.equal(JSON.stringify(jobs.get(response.body.id).document),doc);assert.equal(JSON.stringify(jobs.get(response.body.id).filters),filters);
 for(let i=0;i<200&&!['completed','failed'].includes(jobs.get(response.body.id).status);i++)await new Promise(r=>setTimeout(r,2));
 assert.equal(jobs.get(response.body.id).status,'completed');
});
test('문서 생성 실패는 같은 입력·필터·발언자로 새 문서를 만들고 검토에서 멈춤',async()=>{
 const source=jobs.get(created);source.document=null;
 await own().post(`/api/persona-debates/${created}/restart`).set('Authorization','Bearer own').send({mode:'opinions'}).expect(400);
 const before=calls;
 const response=await own().post(`/api/persona-debates/${created}/restart`).set('Authorization','Bearer own').send({mode:'document'}).expect(202);
 for(let i=0;i<200&&jobs.get(response.body.id).status!=='review';i++)await new Promise(r=>setTimeout(r,2));
 const next=jobs.get(response.body.id);assert.equal(next.status,'review');assert.equal(next.input,source.input);assert.deepEqual(next.filters,source.filters);assert.deepEqual(next.speakerIds,source.speakerIds);assert.equal(calls,before);
});


test('조건 조합 API는 저장·의견 호출 없이 마크다운만 반환하고 소유권·버전을 검사',async()=>{
 const response=await own().post(url).set('Authorization','Bearer own').send({input:'술값의 소비분을 나눌까?',filters:{sex:['여성']}}).expect(202);
 const id=response.body.id;
 for(let i=0;i<200&&jobs.get(id).status!=='review';i++)await new Promise(r=>setTimeout(r,2));
 const job=jobs.get(id),d=job.document,before=JSON.stringify(job),count=calls;
 const edit={revision:job.revision,question:d.question,proposition:d.proposition,context:d.context,summary:d.summary,keyIssues:d.keyIssues,supportingLogic:d.supportingLogic,opposingLogic:d.opposingLogic,evidenceMessageIds:d.evidenceMessageIds,constraints:['같은 양 소비'],assumptions:['병 전체 대신 소비분 정산']};
 const path=`/api/persona-debates/${id}/document/compose`;
 const composed=await own().post(path).set('Authorization','Bearer own').send(edit).expect(200);
 assert.match(composed.body.markdown,/같은 양 소비/);assert.match(composed.body.markdown,/여성/);assert.equal(JSON.stringify(job),before);assert.equal(calls,count);
 await own().post(path).send(edit).expect(401);
 await own().post(path).set('Authorization','Bearer other').send(edit).expect(404);
 await own().post(path).set('Authorization','Bearer own').send({...edit,revision:job.revision+1}).expect(409);
 for(const fields of [{markdown:' '},{markdown:'가'.repeat(10001)},{markdownEdited:'yes'}])await own().patch(`/api/persona-debates/${id}/document`).set('Authorization','Bearer own').send({...edit,...fields}).expect(400);
 const markdown='\n# 직접 고친 최종 문서\n\n소비량 100ml만 정산한다.  \n';
 const saved=await own().patch(`/api/persona-debates/${id}/document`).set('Authorization','Bearer own').send({...edit,markdown,markdownEdited:true}).expect(200);
 assert.equal(saved.body.document.markdown,markdown);
 const prior=JSON.stringify(jobs.get(id));
 const researchPath=`/api/persona-debates/${id}/research`,revision=saved.body.revision;
 await own().post(researchPath).send({revision,queries:['공개 가격']}).expect(401);
 await own().post(researchPath).set('Authorization','Bearer other').send({revision,queries:['공개 가격']}).expect(404);
 await own().post(researchPath).set('Authorization','Bearer own').send({revision:1,queries:['공개 가격']}).expect(409);
 for(const queries of [[],['x'],Array(4).fill('가격'),['동일','동일']])await own().post(researchPath).set('Authorization','Bearer own').send({revision,queries}).expect(400);
 const next=await own().post(researchPath).set('Authorization','Bearer own').send({revision,queries:['제품별 용량 국내 가격']}).expect(202);
 for(let i=0;i<200&&jobs.get(next.body.id).status!=='review';i++)await new Promise(r=>setTimeout(r,2));
 assert.equal(JSON.stringify(jobs.get(id)),prior);assert.notEqual(next.body.id,id);
 const fresh=jobs.get(next.body.id);assert.equal(fresh.status,'review');assert.equal(fresh.document.markdown,markdown);assert.equal(fresh.document.researchUpdated,true);assert.deepEqual(fresh.document.constraints,['같은 양 소비']);assert.equal(calls,count);
 await own().post(`/api/persona-debates/${fresh.id}/run`).set('Authorization','Bearer own').send({revision:fresh.revision}).expect(409);
});
