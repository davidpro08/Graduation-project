require('reflect-metadata');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {TavilyResearch}=require('../dist/debates/document-research');
const {prepareDocument,editDocument,analysisTopic}=require('../dist/debates/debate.document');
const {composeMarkdown}=require('../dist/debates/debate-markdown');
const {opinionContext}=require('../dist/debates/debate.context');
const {QwenDebateHttp,JevOpinionHttp}=require('../dist/debates/debate.http');
const {DebateError}=require('../dist/debates/debate.types');
const {researchFields,sourceSnippets}=require('../dist/debates/research-document');
const schema={kind:'numeric',unit:'원',basis:'1인당 실제 소비분 분담금',options:[{id:'o1',label:'만원 미만',min:0,max:10000},{id:'o2',label:'만원 이상',min:10000,max:null},{id:'o0',label:'판단 보류'}]};
const topic={question:'세 술의 소비분을 어떻게 정산할까?',proposition:'소비한 양과 실제 결제액으로 분담',summary:'참여자 세 명 중 한 명이 술을 가져왔다.',context:'합성 맥락',facts:['참여자는 3명'],constraints:['같은 양을 소비했는지 미확인'],assumptions:['같은 양 소비 시나리오'],keyIssues:['병 전체와 소비량 중 정산 기준'],supportingLogic:[],opposingLogic:[],answerSchema:schema,evidenceMessageIds:[],researchQueries:['술A 가격','술B 가격','술C 가격']};
const source={id:'s1',title:'합성 공개 가격',url:'https://example.org/a',content:'700ml 제품의 참고 판매가는 60000원이다.',retrievedAt:'2026-11-03T00:00:00Z',publishedAt:null};
const evidence=()=>({status:'ready',queries:['술A 가격'],sources:[{...source}],findings:[],errors:[]});
const prepare=(ai,seed)=>prepareDocument(ai,{}, {},'c',topic.question,[],new AbortController().signal,0,undefined,[],{collect:async()=>evidence()},seed,['술A 가격'],{sex:['여성']});
const edit=d=>({revision:1,question:d.question,proposition:d.proposition,context:d.context,summary:d.summary,facts:d.facts,constraints:d.constraints,assumptions:d.assumptions,answerSchema:d.answerSchema,keyIssues:d.keyIssues,supportingLogic:d.supportingLogic,opposingLogic:d.opposingLogic,evidenceMessageIds:d.evidenceMessageIds});

test('검색어별 순환 선택은 세 번째 술의 자료도 보존하고 검색어별 출처를 연결',async()=>{
 const old=global.fetch,key=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY='synthetic';
 try{
  global.fetch=async(_url,options)=>{const {query}=JSON.parse(options.body);return new Response(JSON.stringify({results:Array.from({length:3},(_,i)=>({title:`${query} ${i}`,url:`https://example.org/${encodeURIComponent(query)}/${i}`,content:`${query}의 합성 자료 ${i}`}))}));};
  const data=await new TavilyResearch().collect(topic.researchQueries,new AbortController().signal);
  assert.equal(data.status,'ready');assert.equal(data.sources.length,6);
  assert.deepEqual(data.sources.slice(0,3).map(s=>s.queries[0]),topic.researchQueries);
  assert.ok(data.queryResults.every(q=>q.sourceIds.length===2));
 }finally{global.fetch=old;if(key===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=key;}
});

test('일부 검색어의 자료가 없으면 전체 성공으로 숨기지 않는다',async()=>{
 const old=global.fetch,key=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY='synthetic';
 try{
  global.fetch=async(_url,options)=>new Response(JSON.stringify({results:JSON.parse(options.body).query==='술C 가격'?[]:[{title:'참고',url:'https://example.org/shared',content:'공통 자료'}]}));
  const data=await new TavilyResearch().collect(topic.researchQueries,new AbortController().signal);
  assert.equal(data.status,'partial');assert.equal(data.queryResults[2].status,'empty');assert.ok(data.errors.includes('SEARCH_NO_RESULTS'));
  assert.deepEqual(data.sources[0].queries,['술A 가격','술B 가격']);
 }finally{global.fetch=old;if(key===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=key;}
});

test('외부 정리 형식 오류는 한 번 재시도하고 실제 오류 코드를 문서에 보존',async()=>{
 let calls=0;
 const doc=await prepare({refine:async()=>topic,enrich:async()=>{calls++;throw new DebateError('AI_TOPIC_EVIDENCE');}});
 assert.equal(calls,2);assert.deepEqual(doc.research.enrichment,{status:'failed',attempts:2,errorCodes:['AI_TOPIC_EVIDENCE','AI_TOPIC_EVIDENCE']});
 assert.equal(doc.research.sources[0].url,source.url);assert.match(doc.markdown,/AI_TOPIC_EVIDENCE/);assert.match(doc.markdown,/미검토 검색 발췌/);
});

test('외부 정리는 초안의 응답 구간·조건을 재생성하지 않고 근거만 보완',async()=>{
 const old=global.fetch,seen=[];
 try{
  global.fetch=async(url,options)=>{
   const body=JSON.parse(options.body);seen.push(body);
   if(String(url).endsWith('/tokenize'))return new Response('{"count":100,"max_model_len":8192}');
   return new Response(JSON.stringify({model:'synthetic',choices:[{finish_reason:'stop',message:{content:JSON.stringify({goal:'1인당 분담금 판단',constraints:['정확한 등급·용량 확인'],assumptions:[],findings:[{text:'참고 판매가 60000원',sourceId:'s1',quote:'참고 판매가는 60000원'}]})}}]}));
  };
  const doc=await new QwenDebateHttp().enrich(topic,evidence(),new AbortController().signal);
  assert.deepEqual(doc.answerSchema,schema);assert.ok(doc.constraints.includes(topic.constraints[0]));assert.ok(doc.constraints.includes('정확한 등급·용량 확인'));
  assert.equal(doc.research.findings.length,1);assert.equal(seen.at(-1).max_tokens,1152);
 }finally{global.fetch=old;}
});

test('조건·조사·대상으로 완성 문서를 조합하고 직접 수정한 공백까지 보존',async()=>{
 const original=await prepare({refine:async()=>topic});
 assert.match(original.markdown,/질문/);assert.match(original.markdown,/여성/);assert.match(original.markdown,/같은 양 소비 시나리오/);
 const custom='\n# 사용자가 고친 최종 문서\n\n- 실제 소비분만 정산한다.  \n';
 const saved=editDocument(original,{...edit(original),markdown:custom,markdownEdited:true});
 assert.equal(saved.markdown,custom);
 const changed=editDocument(saved,{...edit(saved),constraints:['다른 조건']});
 assert.equal(changed.markdown,custom);assert.match(composeMarkdown(changed),/다른 조건/);
 for(const markdown of ['   ','가'.repeat(10001)])assert.throws(()=>editDocument(original,{...edit(original),markdown}));
});

test('재조사는 초안 재작성 없이 기존 조건과 직접 편집 문서를 보존하고 새 자료 검토를 요구',async()=>{
 const seed={...await prepare({refine:async()=>topic}),markdown:'# 사용자 편집본\n소비량 100ml',markdownEdited:true,selectedMessageIds:[]};
 const snapshot=JSON.stringify(seed);
 const next=await prepare({refine:async()=>{throw Error('초안 재작성 금지');}},seed);
 assert.equal(JSON.stringify(seed),snapshot);assert.equal(next.markdown,seed.markdown);assert.equal(next.researchUpdated,true);assert.deepEqual(next.constraints,seed.constraints);
 const saved=editDocument(next,{...edit(next),markdown:next.markdown,markdownEdited:true,researchReviewed:true});assert.equal(saved.researchUpdated,false);
});

test('확정 문서는 Qwen·JEV 양쪽에 정확히 한 번 전달되고 과거 항목과 원문은 제외',async()=>{
 const old=global.fetch,jev=process.env.JEV_OPINIONS_URL;process.env.JEV_OPINIONS_URL='http://school.example/opinions';
 const custom='# 최종 질문\n\n소비한 100ml만 정산하고 미확인 가격은 가정하지 않는다.';
 const document={...topic,markdown:custom,facts:['오래된 사실표식'],research:{...evidence(),sources:[{...source,content:'옛 검색 원문표식'}]},statements:[{text:'개인 원문표식'}]};
 const payload=analysisTopic(document),persona={id:'a'.repeat(32),persona:'합성 정산 경험'};
 assert.deepEqual(opinionContext(payload),payload);assert.equal(payload.context,custom);assert.equal(payload.facts,undefined);
 try{
  global.fetch=async(url,options)=>{
   const data=JSON.parse(options.body),text=options.body;
   const sent=data.topic??JSON.parse(data.messages[1].content).topic;
   assert.equal(sent.context,custom);assert.equal(Object.values(sent).filter(v=>v===custom).length,1);assert.ok(!/오래된 사실표식|옛 검색 원문표식|개인 원문표식/.test(text));
   if(String(url).endsWith('/tokenize'))return new Response('{"count":100,"max_model_len":8192}');
   if(String(url)===process.env.JEV_OPINIONS_URL)return new Response(JSON.stringify({version:'persona-opinion-v2',personaId:persona.id,model:'synthetic',opinion:{optionId:'o0',opinion:'판단 보류',scoreKind:'conditional_option_probability',optionProbabilities:[0.1,0.1,0.8]}}));
   assert.equal(JSON.parse(data.messages[1].content).topic.context,custom);
   return new Response(JSON.stringify({model:'synthetic',choices:[{finish_reason:'stop',message:{content:JSON.stringify({optionId:'o0',numericValue:null,opinion:'보류',answer:'가격 확인이 필요합니다.',personaBasis:'명확한 비용 정산 습관'})}}]}));
  };
  await new QwenDebateHttp().respond(payload,persona,new AbortController().signal);await new JevOpinionHttp().respond(payload,persona,new AbortController().signal);
 }finally{global.fetch=old;if(jev===undefined)delete process.env.JEV_OPINIONS_URL;else process.env.JEV_OPINIONS_URL=jev;}
});


test('발췌 ID로 선택한 인용은 원문 그대로 연결하고 존재하지 않는 ID는 거절',()=>{
 const snippets=sourceSnippets(source);assert.equal(snippets[0].id,'s1p1');
 const value={goal:'소비분 분담',constraints:[],assumptions:[],findings:[{sourceId:'s1',snippetId:'s1p1',text:'합성 판매가 참고'}]};
 const result=researchFields(value,topic,evidence());assert.equal(result.research.findings[0].quote,source.content);
 assert.throws(()=>researchFields({...value,findings:[{...value.findings[0],snippetId:'s2p1',quote:source.content}]},topic,evidence()),e=>e.code==='AI_TOPIC_EVIDENCE');
 const unicode={...source,content:'가'.repeat(159)+'😀'+'나'.repeat(500)};
 assert.ok(sourceSnippets(unicode).every(s=>unicode.content.includes(s.text)&&!/[\uD800-\uDBFF]$/.test(s.text)));
});


test('발췌 선택 응답의 모델 해석을 사실로 저장하지 않고 원문만 사용',()=>{
 const value={goal:'분담 기준',constraints:[],assumptions:[],findings:[{sourceId:'s1',snippetId:'s1p1',text:'자료에 없는 20년 숙성 주장'}]};
 const result=researchFields(value,topic,evidence());
 assert.equal(result.research.findings[0].text,source.content);assert.equal(result.research.findings[0].snippetId,'s1p1');assert.deepEqual(result.facts,topic.facts);
 assert.ok(!JSON.stringify(result).includes('20년 숙성'));
});


test('재조사 후 단순 저장만으로 검토 확인을 우회하지 않는다',async()=>{
 const doc={...await prepare({refine:async()=>topic}),researchUpdated:true};
 assert.equal(editDocument(doc,{...edit(doc),markdown:doc.markdown}).researchUpdated,true);
 assert.equal(editDocument(doc,{...edit(doc),markdown:doc.markdown,researchReviewed:true}).researchUpdated,false);
});
