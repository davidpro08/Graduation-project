import { Injectable } from '@nestjs/common';
import type { DocumentResearch, ResearchProvider, ResearchSource } from './debate.types';
/** 외부로는 공개 주제 검색어만 보낸다. 선택 대화·페르소나·사용자 토큰은 인자로 받지 않는다. */
@Injectable()
export class TavilyResearch implements ResearchProvider {
 async collect(queries:string[],signal:AbortSignal):Promise<DocumentResearch>{
  const safe=[...new Set(queries.filter(q=>typeof q==='string'&&q.trim().length>=2&&q.length<=150&&!/(@|https?:|[0-9]{2,3}[- ]?[0-9]{3,4}[- ]?[0-9]{4}|[가-힣]{2,4}(씨|님))/.test(q)).map(q=>q.trim()))].slice(0,3);
  const result:DocumentResearch={status:'not_needed',queries:safe,sources:[],findings:[],errors:[]};
  if(!safe.length)return result;
  const key=process.env.TAVILY_API_KEY;if(!key?.trim())return {...result,status:'unconfigured',errors:['SEARCH_NOT_CONFIGURED']};
  const responses=await Promise.allSettled(safe.map(async query=>{
   const response=await fetch('https://api.tavily.com/search',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key.trim()}`},body:JSON.stringify({query,search_depth:'basic',max_results:3,include_answer:false,include_raw_content:false,include_published_date:true,auto_parameters:false}),signal:AbortSignal.any([signal,AbortSignal.timeout(20000)])});
   if(!response.ok)throw new Error(response.status===401||response.status===403?'SEARCH_AUTH_ERROR':response.status===429?'SEARCH_RATE_LIMIT':'SEARCH_UNAVAILABLE');
   const raw=await response.text();if(raw.length>1048576)throw new Error('SEARCH_INVALID_RESPONSE');const data=JSON.parse(raw) as {results?:Record<string,unknown>[]};if(!Array.isArray(data.results))throw new Error('SEARCH_INVALID_RESPONSE');
   return data.results.slice(0,3).flatMap(row=>{
    if(!row||typeof row!=='object')return [];
    if(typeof row.url!=='string'||row.url.length>2000||typeof row.title!=='string'||typeof row.content!=='string'||!row.content.trim())return [];
    try{const url=new URL(row.url);if(url.protocol!=='https:'||url.username||url.password||url.hostname==='localhost'||/^([0-9]+\.){3}[0-9]+$/.test(url.hostname))return [];}catch{return [];}
    return [{id:'',title:row.title.slice(0,200),url:row.url,content:row.content.slice(0,1200),publishedAt:typeof row.published_date==='string'?row.published_date.slice(0,100):null,retrievedAt:new Date().toISOString(),queries:[query]} satisfies ResearchSource];
   });
  }));
  signal.throwIfAborted();
  // 검색어마다 한 건씩 순서대로 선택해 특정 검색어가 전체 출처를 차지하지 않게 한다.
  const chosen=new Map<string,ResearchSource>();
  for(let rank=0;rank<3;rank++)for(const response of responses){
   const source=response.status==='fulfilled'?response.value[rank]:undefined;
   if(!source)continue;
   const existing=chosen.get(source.url);
   if(existing)existing.queries=[...new Set([...(existing.queries??[]),...(source.queries??[])])];
   else if(chosen.size<6)chosen.set(source.url,{...source,queries:[...(source.queries??[])]});
  }
  result.sources=[...chosen.values()].map((source,i)=>({...source,id:`s${i+1}`}));
  result.queryResults=responses.map((response,i)=>{
   const query=safe[i],sourceIds=result.sources.filter(s=>s.queries?.includes(query)).map(s=>s.id);
   if(response.status==='fulfilled'&&sourceIds.length)return {query,status:'ready' as const,sourceIds};
   const errorCode=response.status==='rejected'&&response.reason instanceof Error&&/^SEARCH_[A-Z_]+$/.test(response.reason.message)?response.reason.message:response.status==='fulfilled'?'SEARCH_NO_RESULTS':'SEARCH_UNAVAILABLE';
   result.errors.push(errorCode);
   return {query,status:response.status==='fulfilled'?'empty' as const:'failed' as const,sourceIds,errorCode};
  });
  result.errors=[...new Set(result.errors)];
  result.status=result.sources.length?(result.errors.length?'partial':'ready'):'failed';return result;
 }
}
