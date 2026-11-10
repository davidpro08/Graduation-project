require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {AnalysisRunner}=require('../dist/analyses/analysis-runner');
const {analysisChunks,groupedMessages}=require('../dist/analyses/analysis-chunks');
const {QwenHttp,validateItems}=require('../dist/analyses/qwen.http');
const {AnalysisError}=require('../dist/analyses/analysis.types');
const {scheduleCandidate,mergeScheduleCandidates}=require('../dist/analyses/schedule-candidate');
const signal=()=>new AbortController().signal;
const row=(text='합성 대화',overrides={})=>({id:randomUUID(),sequence:0,participantId:null,speaker:'합성A',date:'2026-11-01',time:'10:00',kind:'text',text,...overrides});
const aiBase=()=>({count:async()=>({count:10,limit:5000}),analyze:async()=>({items:[],model:'synthetic'})});
const run=(ai,rows,type='schedule')=>new AnalysisRunner(ai,0).run(type,rows,signal(),async()=>{});

test('일정 입력은 날짜·30분 대화 세션으로 묶고 발언 순서와 시각을 보존한다',()=>{
  const rows=[row('내일 회의하자'),row('오후 3시 어때',{time:'10:20'}),row('새 이야기',{time:'12:00'}),row('다음날',{date:'2026-11-02',time:'00:01'})];
  assert.deepEqual(groupedMessages(rows).map(group=>group.messages.length),[2,1,1]);
  const chunks=analysisChunks(rows,'schedule');assert.deepEqual(chunks.map(chunk=>chunk.length),[2,1,1]);
  assert.deepEqual(chunks.flat().map(message=>message.id),rows.map(message=>message.id));
  assert.equal(groupedMessages(rows)[0].toTime,'10:20');
});

test('긴 단일 발언을 유니코드 손실 없이 잘라서 모두 보낸다',()=>{
  const text='😀가'.repeat(3000),message=row(text);
  assert.equal(analysisChunks([message],'schedule').flat().map(part=>part.text).join(''),text);
});

test('일시적인 응답 형식 오류는 한 번 재시도해 정상 결과를 보존한다',async()=>{
  const ai=aiBase();let attempts=0;
  ai.analyze=async()=>{if(++attempts===1)throw new AnalysisError('AI_INVALID_RESPONSE');return {items:[],model:'synthetic'};};
  const result=await run(ai,[row()]);assert.equal(attempts,2);assert.equal(result.metadata.retries,1);assert.equal(result.metadata.coverage,'complete');
});

test('계속 실패하는 근거 구간만 재분할하고 성공한 구간은 부분 결과로 남긴다',async()=>{
  const rows=Array.from({length:4},(_,sequence)=>row(`발언${sequence}`,{sequence})),bad=rows[3].id,ai=aiBase();
  ai.analyze=async(_type,batch)=>{if(batch.some(message=>message.id===bad))throw new AnalysisError('AI_INVALID_EVIDENCE');return {items:[{title:'정상 후보',dateTimeText:'내일',evidenceMessageIds:[batch[0].id]}],model:'synthetic'};};
  const result=await run(ai,rows);
  assert.equal(result.metadata.coverage,'partial');assert.ok(result.metadata.splits>0);assert.ok(result.items.length>0);
  assert.ok(result.items.every(item=>!item.evidenceMessageIds.includes(bad)));assert.equal(result.metadata.failedChunks,1);
  assert.equal(result.metadata.failures[0].errorCode,'AI_INVALID_EVIDENCE');assert.ok(!JSON.stringify(result.metadata).includes('발언3'));
});

test('연결 장애가 이어지면 요청 폭주를 막고 앞서 성공한 결과와 실패 범위를 보존한다',async()=>{
  const rows=Array.from({length:10},(_,index)=>row('합성',{date:`2026-11-${String(index+1).padStart(2,'0')}`})),ai=aiBase();let calls=0;
  ai.count=async()=>{if(++calls>1)throw new AnalysisError('AI_UNAVAILABLE');return {count:10,limit:5000};};
  const result=await run(ai,rows);
  assert.equal(calls,7);assert.equal(result.metadata.coverage,'partial');assert.equal(result.metadata.successfulChunks,1);assert.equal(result.metadata.failedChunks,9);
});

test('전 구간 연결 실패와 인증 오류를 성공으로 위장하지 않는다',async()=>{
  for(const code of ['AI_UNAVAILABLE','AI_AUTH_ERROR']){const ai=aiBase();let calls=0;ai.count=async()=>{calls++;throw new AnalysisError(code);};
    await assert.rejects(run(ai,[row()]),error=>error.code===code);assert.equal(calls,code==='AI_AUTH_ERROR'?1:2);}
});

test('취소된 작업은 새로운 모델 요청을 만들지 않는다',async()=>{
  const ai=aiBase();ai.count=async()=>{throw Error('요청 금지');};
  await assert.rejects(new AnalysisRunner(ai,0).run('schedule',[row()],AbortSignal.abort(),async()=>{}));
});

test('서로 다른 발언의 내일·시각을 연결하고 부족한 값은 추정 경고와 함께 채운다',()=>{
  const rows=[row('내일 회의하자'),row('오후 3시에 만나자',{time:'10:05'})];
  const exact=scheduleCandidate({dateTimeText:'내일 오후 3시',evidenceMessageIds:rows.map(message=>message.id)},rows);
  assert.equal(exact.date,'2026-11-02');assert.equal(exact.time,'15:00');assert.equal(exact.uncertain,false);
  const vague=[row('조만간 만날까?')];
  const estimated=scheduleCandidate({dateTimeText:'조만간',date:'2026-11-03',time:'18:00',uncertain:true,evidenceMessageIds:[vague[0].id]},vague);
  assert.equal(estimated.date,'2026-11-03');assert.equal(estimated.time,'18:00');assert.equal(estimated.uncertain,true);assert.ok(estimated.warnings.length);
  const fallback=scheduleCandidate({dateTimeText:'조만간',evidenceMessageIds:[vague[0].id]},vague);
  assert.equal(fallback.date,'2026-11-01');assert.equal(fallback.time,'10:00');assert.equal(fallback.uncertain,true);
});

test('유효하지 않은 AI 날짜·시간은 거절하고 모순 본문은 제목 추가와 무관하게 보존한다',()=>{
  const rows=[row(),row()],summary='담당자가 제출하겠다는 발언과 이후 부인한 발언이 다릅니다.';
  const result=validateItems({items:[{title:'제출 담당 발언 번복',summary,evidenceMessageIds:rows.map(message=>message.id)}]},'contradiction',rows)[0];
  assert.equal(result.summary,summary);assert.equal(result.title,'제출 담당 발언 번복');
  for(const fields of [{date:'2026-02-30'},{time:'25:00'},{uncertain:'true'}])assert.throws(()=>validateItems({items:[{title:'회의',dateTimeText:'내일',evidenceMessageIds:[rows[0].id],...fields}]},'schedule',rows));
});

test('Qwen에는 짧은 근거 ID와 대화 세션을 보내고 응답 ID를 실제 원문 ID로 복원한다',async()=>{
  const previous=global.fetch,rows=[row('내일 회의하자'),row('오후 3시',{time:'10:10'})],ai=new QwenHttp();
  try{
    global.fetch=async(_url,options)=>{const body=JSON.parse(options.body),input=JSON.parse(body.messages[1].content);
      assert.equal(input.sessions[0].date,'2026-11-01');assert.equal(input.sessions[0].messages[0].id,'m1');assert.equal(input.sessions[0].messages[1].id,'m2');
      assert.ok(!options.body.includes(rows[0].id));
      return new Response(JSON.stringify({model:'synthetic',choices:[{finish_reason:'stop',message:{content:JSON.stringify({items:[{title:'회의',dateTimeText:'내일 오후 3시',date:'2026-11-02',time:'15:00',uncertain:false,evidenceMessageIds:['m1','m2']}]})}}]}));};
    const result=await ai.analyze('schedule',rows,signal());assert.deepEqual(result.items[0].evidenceMessageIds,rows.map(message=>message.id));
    global.fetch=async()=>new Response('{}',{status:429});await assert.rejects(ai.count('schedule',rows,signal()),error=>error.code==='AI_BUSY');
    global.fetch=async()=>new Response('{}',{status:403});await assert.rejects(ai.count('schedule',rows,signal()),error=>error.code==='AI_AUTH_ERROR');
  }finally{global.fetch=previous;}
});

test('응답 대기 만료와 연결 오류를 구분하고 후보 초과 응답은 재분할 대상으로 처리한다',async()=>{
  const previous=global.fetch,originalTimeout=AbortSignal.timeout,ai=new QwenHttp(),rows=[row()];
  try{
    global.fetch=async()=>new Response(JSON.stringify({model:'synthetic',choices:[{finish_reason:'stop',message:{content:'{"items":[],"moreCandidates":true}'}}]}));
    await assert.rejects(ai.analyze('schedule',rows,signal()),error=>error.code==='AI_CONTEXT_ERROR');
    AbortSignal.timeout=()=>AbortSignal.abort(new DOMException('timeout','TimeoutError'));
    global.fetch=async(_url,options)=>{options.signal.throwIfAborted();};
    await assert.rejects(ai.count('schedule',rows,signal()),error=>error.code==='AI_REQUEST_TIMEOUT');
  }finally{global.fetch=previous;AbortSignal.timeout=originalTimeout;}
});

test('같은 회의의 부분 후보를 합치되 별도 시각과 별도 근거의 일정은 유지한다',()=>{
  const candidate=(ids,time,temporary=false)=>({title:'회의',evidenceMessageIds:ids,suggestion:{date:'2026-11-03',time,warnings:temporary?['정확한 시간이 없어 발언 시각으로 임시 입력했습니다.']:[]}});
  const partial=candidate(['m1'],'10:00',true),complete=candidate(['m1','m2','m3'],'15:00'),separateTime=candidate(['m1'],'09:00'),separateEvidence=candidate(['m4'],'15:00');
  assert.deepEqual(mergeScheduleCandidates([partial,complete,separateTime,separateEvidence]),[complete,separateTime,separateEvidence]);
});

test('같은 세션의 장소 확인만 별도 후보가 되면 하나의 명확한 약속에 연결하고 복수 약속이면 보존한다',()=>{
  const meeting={title:'프로젝트 회의',evidenceMessageIds:['m1','m2'],suggestion:{date:'2026-11-03',time:'15:00',referenceDate:'2026-11-02',referenceTime:'10:00',warnings:[]}};
  const location={title:'프로젝트 회의 장소',evidenceMessageIds:['m3'],suggestion:{date:'2026-11-02',time:'10:10',referenceDate:'2026-11-02',referenceTime:'10:10',warnings:['날짜를 발언 날짜로 임시 입력했습니다.','시간을 발언 시각으로 임시 입력했습니다.']}};
  const merged=mergeScheduleCandidates([meeting,location]);assert.equal(merged.length,1);assert.deepEqual(merged[0].evidenceMessageIds,['m1','m2','m3']);assert.equal(merged[0].suggestion.time,'15:00');
  const different={...meeting,evidenceMessageIds:['m4'],suggestion:{...meeting.suggestion,time:'09:00'}};
  assert.equal(mergeScheduleCandidates([meeting,different,location]).length,3);
});
