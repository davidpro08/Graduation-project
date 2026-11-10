require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateClaims,sourceHash}=require('../dist/analyses/claims');
const {ClaimPipeline}=require('../dist/analyses/claim-pipeline');
const {AnalysesService}=require('../dist/analyses/analyses.service');
const {JevClaimHttp,QwenClaimHttp}=require('../dist/analyses/claim.http');
const a={id:'a',text:'금요일에 제출한다.',speaker:'민수',participantId:'p',date:'2026-11-01',time:'10:00',kind:'text'};
const b={...a,id:'b',text:'금요일에 제출하지 않는다.'};
const claim=m=>({evidence:m.text,subject:'민수',predicate:'제출하다',object:null,polarity:m.id==='a'?'positive':'negative',qualifiers:['금요일']});
const value=m=>({message_id:m.id,claims:[claim(m)]});
const user={id:'owner',token:'synthetic'},signal=new AbortController().signal;
function fixture(){
 const saved=new Map(),events=[];
 const store={load:async(_u,_c,m)=>{events.push('load:'+m.id);return saved.get(m.id)??null;},save:async(_u,_c,m,v)=>{events.push('save:'+m.id);saved.set(m.id,v);}};
 const extractor={extract:async m=>{events.push('extract:'+m.id);return value(m);}};
 const judge={judge:async(l,r)=>{events.push('judge');assert.equal(saved.size,2);assert.deepEqual(l.claim,claim(a));assert.equal(r.message.text,b.text);return {verdict:'contradiction',probabilities:[0.8,0.1,0.1],model:'fake'};}};
 return {saved,events,store,extractor,judge,pipeline:new ClaimPipeline(store,extractor,judge)};
}
test('strict claim contract, optional original_text, multiple/empty claims, exact evidence',()=>{
 assert.equal(validateClaims(value(a),a).original_text,a.text);
 assert.deepEqual(validateClaims({message_id:a.id,claims:[]},a).claims,[]);
 const valid=value(a);valid.claims.push({...claim(a),subject:null,polarity:'uncertain',qualifiers:['부정 범위 불명확']});assert.equal(validateClaims(valid,a).claims.length,2);
 for(const bad of [{...value(a),extra:1},{...value(a),message_id:'b'},{...value(a),original_text:'위조'},
  ...[{evidence:'위조'},{predicate:''},{subject:undefined},{object:3},{polarity:'maybe'},{qualifiers:['']},{extra:true}].map(change=>({message_id:'a',claims:[{...claim(a),...change}]}))])assert.throws(()=>validateClaims(bad,a),/AI_INVALID_CLAIMS/);
 assert.notEqual(sourceHash(a),sourceHash({...a,text:'수정'}));assert.notEqual(sourceHash(a),sourceHash({...a,speaker:'영희'}));
});
test('persist and re-read before JEV; cached rerun skips extraction',async()=>{
 const f=fixture();let result=await f.pipeline.run(user,'c',[a,b],signal,async()=>{});
 assert.deepEqual(f.events,['load:a','extract:a','save:a','load:a','load:b','extract:b','save:b','load:b','judge']);
 assert.equal(result.items.length,1);assert.deepEqual(result.items[0].evidenceMessageIds,['a','b']);
 f.events.length=0;result=await f.pipeline.run(user,'c',[a,b],signal,async()=>{});assert.equal(result.metadata.cachedMessages,2);assert.deepEqual(f.events,['load:a','load:b','judge']);
});
test('storage loss or invalid extraction never reaches classifier',async()=>{
 for(const mode of ['save','read','invalid']){
  const f=fixture();if(mode==='save')f.store.save=async()=>{throw Error('db down');};
  if(mode==='read')f.store.save=async()=>{};
  if(mode==='invalid')f.extractor.extract=async()=>({...value(a),message_id:'foreign'});
  await assert.rejects(f.pipeline.run(user,'c',[a,b],signal,async()=>{}));assert.ok(!f.events.includes('judge'));
 }
});
test('empty claims are cached; unknown is not a contradiction; pair cap fails explicitly',async()=>{
 const f=fixture();f.extractor.extract=async m=>({message_id:m.id,claims:[]});
 assert.equal((await f.pipeline.run(user,'c',[a,b],signal,async()=>{})).metadata.comparedPairs,0);assert.equal(f.saved.size,2);
 const g=fixture();g.judge.judge=async()=>({verdict:'unknown',model:'fake',probabilities:[0,0,1]});
 const r=await g.pipeline.run(user,'c',[a,b],signal,async()=>{});assert.equal(r.items.length,0);assert.equal(r.metadata.unknownPairs,1);
 const old=process.env.CLAIM_MAX_PAIRS;process.env.CLAIM_MAX_PAIRS='1';try{await assert.rejects(g.pipeline.run(user,'c',[a,b,{...a,id:'c'}],signal,async()=>{}),/CLAIM_PAIR_LIMIT/);}finally{if(old===undefined)delete process.env.CLAIM_MAX_PAIRS;else process.env.CLAIM_MAX_PAIRS=old;}
});
test('service routes contradiction exclusively to persisted-claims pipeline',async()=>{
 let status='pending',pipelineCalls=0;
 const repo={state:async(_u,_id,s)=>{status=s;},find:async()=>({}),complete:async()=>{status='completed';}};
 const service=new AnalysesService(repo,{count:async()=>{throw Error('raw path forbidden');}}, {find:async()=>({endDate:'2026-11-01'}),messages:async()=>({items:[a,b],total:2,pageSize:200})}, {run:async()=>{pipelineCalls++;return {items:[],metadata:{pipeline:'claims-v1'}};}});
 await service.run(user,'job','c','contradiction',new AbortController());assert.equal(status,'completed');assert.equal(pipelineCalls,1);
});
test('HTTP adapters check tokenizer budget, evidence and JEV probability consistency',async()=>{
 const previous=global.fetch,old=process.env.JEV_CLAIMS_URL;process.env.JEV_CLAIMS_URL='http://synthetic/v1/claim-pair';
 try{
  const sent=[];global.fetch=async(url,init)=>{sent.push(JSON.parse(init.body));return new Response(JSON.stringify(url.endsWith('/tokenize')?{count:100,max_model_len:8192}:{choices:[{finish_reason:'stop',message:{content:JSON.stringify(value(a))}}]}));};
  assert.equal((await new QwenClaimHttp().extract(a,signal)).claims.length,1);assert.equal(sent.length,2);
  global.fetch=async()=>new Response(JSON.stringify({count:8000,max_model_len:8192}));await assert.rejects(new QwenClaimHttp().extract(a,signal),/AI_CONTEXT_ERROR/);
  global.fetch=async()=>new Response(JSON.stringify({version:'claim-pair-v1',verdict:'contradiction',probabilities:[0.1,0.8,0.1],model:'fake'}));await assert.rejects(new JevClaimHttp().judge({message:a,claim:claim(a)},{message:b,claim:claim(b)},signal),/JEV_INVALID_RESPONSE/);
 }finally{global.fetch=previous;if(old===undefined)delete process.env.JEV_CLAIMS_URL;else process.env.JEV_CLAIMS_URL=old;}
});
