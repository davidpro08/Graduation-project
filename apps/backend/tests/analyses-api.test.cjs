require('reflect-metadata');
const {before,after,test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {Test}=require('@nestjs/testing');
const request=require('supertest');
const {NotFoundException}=require('@nestjs/common');
const {AppModule}=require('../dist/app.module');
const {configureApp}=require('../dist/configure-app');
const {SupabaseService}=require('../dist/supabase/supabase.service');
const {AuthService}=require('../dist/auth/auth.service');
const {ConversationsService}=require('../dist/conversations/conversations.service');
const {ANALYSIS_REPO,DETAIL_AI}=require('../dist/analyses/analysis.types');
const {JevService}=require('../dist/ai/jev.service');
const owner=randomUUID(),conversation=randomUUID(),message=randomUUID(),jobs=new Map();let app;
const repo={create:async(user,id,conversationId,analysisType)=>{const row={id,owner:user.id,conversationId,analysisType,status:'pending',result:null,metadata:{}};jobs.set(id,row);return {...row};},find:async(user,id)=>{const row=jobs.get(id);if(row?.owner!==user.id)throw new NotFoundException();return {...row};},latest:async(user)=>[...jobs.values()].find(row=>row.owner===user.id)??null,state:async(_user,id,status,errorCode)=>Object.assign(jobs.get(id),{status,errorCode}),complete:async(_user,id,items,metadata)=>Object.assign(jobs.get(id),{status:'completed',result:{items},metadata}),schedules:async()=>[]};
before(async()=>{
  const module=await Test.createTestingModule({imports:[AppModule]})
    .overrideProvider(SupabaseService).useValue({})
    .overrideProvider(AuthService).useValue({verify:async token=>({id:token==='own'?owner:randomUUID(),token})})
    .overrideProvider(ConversationsService).useValue({find:async(user,id)=>{if(user.id!==owner||id!==conversation)throw new NotFoundException();return {};},messages:async()=>({items:[{id:message,speaker:'A',text:'회의 일정',date:'2026-10-01',time:'10:00',kind:'text'}],total:1,pageSize:200})})
    .overrideProvider(ANALYSIS_REPO).useValue(repo)
    .overrideProvider(DETAIL_AI).useValue({count:async()=>({count:10,limit:1200}),analyze:async()=>({items:[{title:'회의',dateTimeText:'내일',evidenceMessageIds:[message]}],model:'synthetic'})})
    .overrideProvider(JevService).useValue({evaluate:async()=>({used:false,reason:'request-disabled'})}).compile();
  app=module.createNestApplication();configureApp(app);await app.init();
});
after(async()=>{await app?.close();});
const own=()=>request(app.getHttpServer());
test('최초 분석 조회는 빈 HTTP 본문 대신 {job:null} JSON 반환',async()=>{const response=await own().get(`/api/conversations/${conversation}/analyses?type=schedule`).set('Authorization','Bearer own').expect(200);assert.deepEqual(response.body,{job:null});});
test('분석 API는 인증·종류·JEV 옵션·추가 필드를 검증',async()=>{
  const url=`/api/conversations/${conversation}/analyses`;
  await own().post(url).send({type:'schedule'}).expect(401);
  for(const body of [{type:'persona'},{type:'schedule',useJev:'false'},{type:'schedule',ownerId:owner}])await own().post(url).set('Authorization','Bearer own').send(body).expect(400);
  await own().post(url).set('Authorization','Bearer other').send({type:'schedule'}).expect(404);
});
test('202 작업 생성·완료 결과 조회·타인 차단·새로고침 복원',async()=>{
  const response=await own().post(`/api/conversations/${conversation}/analyses`).set('Authorization','Bearer own').send({type:'schedule',useJev:false}).expect(202);
  const id=response.body.id;assert.ok(id);
  for(let i=0;i<100&&jobs.get(id).status!=='completed';i++)await new Promise(resolve=>setTimeout(resolve,5));
  const result=await own().get(`/api/analyses/${id}/result`).set('Authorization','Bearer own').expect(200);assert.equal(result.body.items[0].title,'회의');
  await own().get(`/api/analyses/${id}`).set('Authorization','Bearer other').expect(404);
  const saved=await own().get(`/api/conversations/${conversation}/analyses?type=schedule`).set('Authorization','Bearer own').expect(200);assert.equal(saved.body.job.status,'completed');
});
test('진행 중 결과 조회는 409이고 일정 날짜 입력 오류는 400',async()=>{
  const id=randomUUID();jobs.set(id,{id,owner,status:'processing',result:null});
  const service=app.get(require('../dist/analyses/analyses.service').AnalysesService);service.active.set(id,new AbortController());
  await own().get(`/api/analyses/${id}/result`).set('Authorization','Bearer own').expect(409);service.active.delete(id);
  await own().post(`/api/schedules/${randomUUID()}/confirm`).set('Authorization','Bearer own').send({title:'회의',date:'2026-02-30',time:'15:00'}).expect(400);
});
