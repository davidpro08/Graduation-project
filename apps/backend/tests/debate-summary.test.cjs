require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {prepareDocument}=require('../dist/debates/debate.document');
const {QwenDebateHttp,JevOpinionHttp,validateTopic}=require('../dist/debates/debate.http');
const {DebateError}=require('../dist/debates/debate.types');
const {PERSONA_LIMIT,DETAIL_LIMIT}=require('../dist/personas/persona.policy');
const topic={question:'규칙에 예외를 둘까?',proposition:'불가피한 사정에는 예외를 두자.',context:'합성 맥락',summary:'참여자는 공정성을 유지하면서 불가피한 사정을 확인하는 기준을 논의했다.',keyIssues:['예외 기준'],supportingLogic:[],opposingLogic:[],evidenceMessageIds:[]};
const row=(text='합성 대화')=>({id:randomUUID(),sequence:0,participantId:null,speaker:'합성A',kind:'text',date:'2026-11-03',time:'10:00',text});
const chats=rows=>({messages:async(_user,_id,{page,pageSize})=>({items:rows.slice((page-1)*pageSize,page*pageSize),total:rows.length,pageSize})});
const prepare=(ai,rows)=>prepareDocument(ai,chats(rows),{id:randomUUID(),token:'synthetic'},randomUUID(),'규칙에 예외가 필요한가?',[],new AbortController().signal,0,undefined,rows);

test('분석 예산은 최대200명이며 상세20명을 우선한다',()=>{assert.equal(PERSONA_LIMIT,200);assert.equal(DETAIL_LIMIT,20);});

test('문서 생성의 일시적 근거 오류를 재시도하고 핵심 요약을 보존한다',async()=>{
  const rows=[row()];let calls=0;
  const document=await prepare({refine:async()=>{if(++calls===1)throw new DebateError('AI_TOPIC_EVIDENCE');return topic;}},rows);
  assert.equal(document.summary,topic.summary);assert.equal(document.sourceCoverage.retries,1);assert.equal(document.sourceCoverage.partial,true);assert.equal(calls,2);
});

test('빠른 초안의 형식 오류는 최대2회만 시도하고 누적·재분할하지 않는다',async()=>{let calls=0;await assert.rejects(prepare({refine:async()=>{calls++;throw new DebateError('AI_TOPIC_STRUCTURE');}},[row('규칙')]),e=>e.code==='AI_TOPIC_STRUCTURE');assert.equal(calls,2);});

test('요약 전부 실패와 인증 실패는 검토용 가짜 문서로 바꾸지 않는다',async()=>{
  for(const code of ['AI_TOPIC_LENGTH','AI_AUTH_ERROR']){let calls=0;
    await assert.rejects(prepare({refine:async()=>{calls++;throw new DebateError(code);}},[row('!')]),error=>error.code===code);
    assert.equal(calls,code==='AI_AUTH_ERROR'?1:2);}
});

test('사용자가 고른 최대20개만 참고하고 AI 문서는 한 번 생성한다',async()=>{const rows=Array.from({length:20},()=>row('규칙 원문전용표식'));let calls=0;const doc=await prepare({refine:async(_input,batch,previous)=>{calls++;assert.equal(previous,null);assert.ok(batch.length<=20);return topic;}},rows);assert.equal(calls,1);assert.equal(doc.sourceCoverage.mode,'manual');assert.ok(doc.sourceCoverage.scannedMessages<=20);});

test('문서 검증 오류는 형식·길이·근거를 구분한다',()=>{
  for(const [value,code] of [[{...topic,question:null},'AI_TOPIC_STRUCTURE'],[{...topic,summary:'가'.repeat(2001)},'AI_TOPIC_LENGTH'],[{...topic,evidenceMessageIds:['forged']},'AI_TOPIC_EVIDENCE']])assert.throws(()=>validateTopic(value,new Set()),error=>error.code===code);
});

test('Qwen은 짧은 필드만 생성하고 질문·원문 ID·분류 선택지는 서버가 조립',async()=>{const previousFetch=global.fetch,rows=[row('관련 원문')],ai=new QwenDebateHttp();try{global.fetch=async(url,options)=>{if(String(url).endsWith('/tokenize'))return new Response('{"count":100,"max_model_len":8192}');const body=JSON.parse(options.body);assert.equal(body.max_tokens,640);assert.ok(!body.messages[0].content.includes('factEvidence'));return new Response(JSON.stringify({model:'synthetic',choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'짧은 요약',issues:['기준'],unknowns:[],kind:'stance',basis:'질문 평가',unit:'',bounds:[],choices:[]})}}]}));};const result=await ai.refine('원래 질문',rows,null,new AbortController().signal);assert.equal(result.question,'원래 질문');assert.deepEqual(result.evidenceMessageIds,[rows[0].id]);assert.equal(result.answerSchema.options[0].id,'o1');}finally{global.fetch=previousFetch;}});

test('Qwen과 JEV 양쪽 HTTP 의견 요청에서 원문·발언자·근거 ID를 제거하고 요약만 보낸다',async()=>{
  const previousFetch=global.fetch,previousJev=process.env.JEV_OPINIONS_URL,persona={id:'a'.repeat(32),persona:'합성 프로필'};
  const context={...topic,evidenceMessageIds:['원문ID'],statements:[{messageId:'원문ID',speaker:'원문이름',text:'원문비밀표식'}],unexpectedRawText:'원문비밀표식'};
  const opinion={agreement:0,confidence:0.5,opinion:'중립',answer:'추가 근거가 필요합니다.'};
  process.env.JEV_OPINIONS_URL='http://school.example/opinions';
  try{
    global.fetch=async(url,options)=>{
      const body=JSON.parse(options.body);assert.ok(!options.body.includes('원문비밀표식'));assert.ok(!options.body.includes('원문이름'));assert.ok(!options.body.includes('원문ID'));assert.ok(options.body.includes(topic.summary));
      if(String(url).endsWith('/tokenize'))return new Response('{"count":10,"max_model_len":8192}');
      if(String(url)===process.env.JEV_OPINIONS_URL)return new Response(JSON.stringify({version:'persona-opinion-v1',personaId:persona.id,model:'synthetic-jev',opinion}));
      assert.equal(body.messages[1].role,'user');return new Response(JSON.stringify({model:'synthetic-qwen',choices:[{finish_reason:'stop',message:{content:JSON.stringify(opinion)}}]}));
    };
    await new QwenDebateHttp().respond(context,persona,new AbortController().signal);await new JevOpinionHttp().respond(context,persona,new AbortController().signal);
  }finally{global.fetch=previousFetch;if(previousJev===undefined)delete process.env.JEV_OPINIONS_URL;else process.env.JEV_OPINIONS_URL=previousJev;}
});
