require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {AnalysesService}=require('../dist/analyses/analyses.service');
const {validateItems}=require('../dist/analyses/qwen.http');
const {AnalysisError}=require('../dist/analyses/analysis.types');
const {recentAnalysisWindow}=require('../dist/analyses/analysis-window');
const user={id:randomUUID(),token:'synthetic'};
const messages=['제가 제출합니다.','맡겠다고 말한 적 없습니다.'].map((text,sequence)=>({id:randomUUID(),sequence,speaker:'A',date:'2026-10-01',time:'09:00',text,kind:'text',participantId:randomUUID()}));
function fixture(failure){
  const jobs=new Map();let calls=0;
  const repo={create:async(_u,id,conversationId,analysisType)=>{const job={id,conversationId,analysisType,status:'pending',result:null,metadata:{}};jobs.set(id,job);return {...job};},find:async(_u,id)=>{if(!jobs.has(id))throw Error('deleted');return {...jobs.get(id)};},latest:async()=>null,state:async(_u,id,status,errorCode)=>{if(jobs.has(id))Object.assign(jobs.get(id),{status,errorCode});},complete:async(_u,id,items,metadata)=>Object.assign(jobs.get(id),{status:'completed',result:{items},metadata})};
  const ai={count:async()=>({count:100,limit:1200}),analyze:async()=>{calls++;if(failure)throw new AnalysisError(failure);return {items:[{summary:'담당 발언 모순 가능성',evidenceMessageIds:messages.map(m=>m.id)}],model:'synthetic'};}};
  const chats={find:async()=>({endDate:'2026-10-01'}),messages:async()=>({items:messages,total:2,pageSize:200})};
  return {service:new AnalysesService(repo,ai,chats),jobs,repo,ai,chats,get calls(){return calls;}};
}
async function completed(f,type='contradiction'){const job=await f.service.create(user,randomUUID(),type);for(let i=0;i<100;i++){const current=await f.service.find(user,job.id);if(!['pending','processing'].includes(current.status))return current;await new Promise(resolve=>setTimeout(resolve,5));}throw Error('worker timeout');}

test('최근 한 달은 대화 마지막 날짜 기준이며 월말·윤년·연도 경계를 보존한다',()=>{
  for(const [endDate,from] of [['2026-11-02','2026-10-02'],['2026-03-31','2026-02-28'],['2024-03-31','2024-02-29'],['2026-01-15','2025-12-15']]){
    assert.deepEqual(recentAnalysisWindow(endDate),{from,to:endDate});
  }
  for(const invalid of ['',undefined,'2026-02-30','2026-13-01','2026-1-01'])assert.throws(()=>recentAnalysisWindow(invalid));
});

for(const type of ['contradiction','schedule'])test(`${type}: DB 조회부터 최근 한 달만 지정하고 모든 페이지의 텍스트만 분석한다`,async()=>{
  const f=fixture(),seen=new Set(),requests=[];
  f.chats.find=async()=>({endDate:'2024-03-31'});
  const recent=Array.from({length:205},(_,sequence)=>({...messages[0],id:randomUUID(),sequence,date:sequence===204?'2024-03-31':'2024-02-29',text:'최근 대화'}));
  const source=[{...messages[0],date:'2024-02-28'},...recent,{...messages[0],id:randomUUID(),date:'2024-04-01'},
    {...messages[0],kind:'attachment',date:'2024-03-31'},{...messages[0],kind:'system',date:'2024-03-31'}];
  f.chats.messages=async(_user,_id,filter)=>{
    assert.equal(filter.from,'2024-02-29');assert.equal(filter.to,'2024-03-31');requests.push(filter);
    const selected=source.filter(message=>message.date>=filter.from&&message.date<=filter.to);
    return {items:selected.slice((filter.page-1)*filter.pageSize,filter.page*filter.pageSize),total:selected.length,pageSize:filter.pageSize};
  };
  f.ai.count=async(_type,batch)=>{for(const message of batch){assert.equal(message.kind,'text');assert.ok(recent.some(item=>item.id===message.id));}return {count:100,limit:1200};};
  f.ai.analyze=async(_type,batch)=>{for(const message of batch)seen.add(message.id);return {items:[],model:'synthetic'};};
  const job=await completed(f,type);
  assert.equal(job.status,'completed');assert.deepEqual(requests.map(request=>request.page),[1,2]);
  assert.deepEqual(seen,new Set(recent.map(message=>message.id)));
  assert.deepEqual(job.metadata.inputRange,{from:'2024-02-29',to:'2024-03-31',anchor:'conversation_end',messageCount:205});
});

test('기간 내 텍스트가 없으면 과거 대화로 범위를 넓히거나 AI를 호출하지 않는다',async()=>{
  const f=fixture();
  f.chats.messages=async()=>({items:[{...messages[0],date:'2020-01-01'},{...messages[0],kind:'system'}],total:2,pageSize:200});
  f.ai.count=async()=>{throw Error('AI must not run');};
  const job=await completed(f,'schedule');
  assert.equal(job.status,'completed');assert.equal(f.calls,0);assert.deepEqual(job.result.items,[]);
  assert.equal(job.metadata.inputRange.messageCount,0);assert.equal(job.metadata.chunks,0);assert.ok(job.metadata.warnings.length);
});
test('사전 판단 없이 모든 구간을 상세 분석하고 실제 메타데이터를 저장',async()=>{const f=fixture();const job=await completed(f);assert.equal(job.status,'completed');assert.equal(f.calls,1);assert.equal(job.result.items[0].evidenceMessageIds.length,2);assert.equal(job.metadata.qwenModel,'synthetic');assert.equal('jevUsed' in job.metadata,false);assert.equal('skippedChunks' in job.metadata,false);});
test('Qwen 인증 실패는 failed, 더미 결과 없음',async()=>{const f=fixture('AI_AUTH_ERROR');const job=await completed(f);assert.equal(job.status,'failed');assert.equal(job.errorCode,'AI_AUTH_ERROR');assert.equal(job.result,null);});
test('백엔드 재시작으로 중단된 작업을 실패로 복구',async()=>{const f=fixture();const id=randomUUID();f.jobs.set(id,{id,status:'processing',result:null});assert.equal((await f.service.find(user,id)).errorCode,'JOB_INTERRUPTED');});
test('위조 근거 ID와 근거 하나뿐인 모순을 거절',()=>{assert.throws(()=>validateItems({items:[{summary:'x',evidenceMessageIds:[messages[0].id,randomUUID()]}]},'contradiction',messages));assert.throws(()=>validateItems({items:[{summary:'x',evidenceMessageIds:[messages[0].id]}]},'contradiction',messages));});
test('일정 확정 시 존재하지 않는 날짜와 시간을 거절',()=>{const f=fixture();assert.throws(()=>f.service.saveSchedule(user,randomUUID(),{title:'회의',date:'2026-02-30',time:'15:00'},true));assert.throws(()=>f.service.saveSchedule(user,randomUUID(),{title:'회의',date:'2026-10-09',time:'25:00'},true));});
test('Qwen HTTP 인증·연결 장애·잘린 결과를 구분하고 인증 키를 헤더에만 전달',async()=>{
  const {QwenHttp}=require('../dist/analyses/qwen.http');const previousFetch=global.fetch,previousKey=process.env.SCHOOL_AI_API_KEY;
  process.env.SCHOOL_AI_API_KEY='synthetic-key';const ai=new QwenHttp();const signal=new AbortController().signal;
  try{
    global.fetch=async(_url,options)=>{assert.equal(options.headers.Authorization,'Bearer synthetic-key');assert.ok(!options.body.includes('synthetic-key'));return new Response('{}',{status:401});};
    await assert.rejects(ai.count('schedule',messages,signal),error=>error.code==='AI_AUTH_ERROR');
    global.fetch=async()=>{throw Error('network unavailable');};
    await assert.rejects(ai.count('schedule',messages,signal),error=>error.code==='AI_UNAVAILABLE');
    global.fetch=async()=>new Response(JSON.stringify({model:'test',choices:[{finish_reason:'length',message:{content:'{}'}}]}));
    await assert.rejects(ai.analyze('schedule',messages,signal),error=>error.code==='AI_INCOMPLETE_RESPONSE');
    global.fetch=async()=>new Response(JSON.stringify({count:500,max_model_len:2048}));
    assert.deepEqual(await ai.count('schedule',messages,signal),{count:500,limit:960});
  }finally{global.fetch=previousFetch;if(previousKey===undefined)delete process.env.SCHOOL_AI_API_KEY;else process.env.SCHOOL_AI_API_KEY=previousKey;}
});
test('16,120개 합성 메시지의 200개 초과 구간을 모두 상세 분석한다',async()=>{
  const longMessages=Array.from({length:16120},(_,sequence)=>({...messages[0],id:randomUUID(),sequence,text:'합성 인사 메시지입니다. '.repeat(30)}));
  const seen=new Set();const f=fixture();
  f.chats.messages=async(_user,_id,{page,pageSize})=>({items:longMessages.slice((page-1)*pageSize,page*pageSize),total:longMessages.length,pageSize});
  f.ai.analyze=async(_type,batch)=>{for(const message of batch)seen.add(message.id);return {items:[],model:'synthetic'};};
  const job=await completed(f);assert.equal(job.status,'completed');assert.ok(job.metadata.chunks>200);assert.equal(seen.size,16120);
});
test('장기 작업은 소유자 상태 조회의 갱신 토큰을 최종 DB 저장에 사용한다',async()=>{
  const f=fixture();let finish;let entered;
  const started=new Promise(resolve=>{entered=resolve;});const wait=new Promise(resolve=>{finish=resolve;});
  f.ai.analyze=async()=>{entered();await wait;return {items:[],model:'synthetic'};};
  let savedToken;const original=f.repo.complete;f.repo.complete=async(worker,...args)=>{savedToken=worker.token;return original(worker,...args);};
  const job=await f.service.create(user,randomUUID(),'contradiction');await started;
  await f.service.find({...user,token:'refreshed-synthetic'},job.id);finish();
  for(let i=0;i<100&&f.jobs.get(job.id).status!=='completed';i++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(f.jobs.get(job.id).status,'completed');assert.equal(savedToken,'refreshed-synthetic');assert.equal(user.token,'synthetic');
});
test('토큰 한도로 재분할할 때 모든 조각을 상세 분석한다',async()=>{
  const f=fixture();f.chats.messages=async()=>({items:[{...messages[0],text:'가'.repeat(100)}],total:1,pageSize:200});
  let detailText='';
  f.ai.count=async(_type,batch)=>({count:batch[0].text.length,limit:30});
  f.ai.analyze=async(_type,batch)=>{detailText+=batch[0].text;return {items:[],model:'synthetic'};};
  const job=await completed(f);assert.equal(job.status,'completed');assert.equal(detailText,'가'.repeat(100));assert.equal(job.metadata.chunks,4);
});
