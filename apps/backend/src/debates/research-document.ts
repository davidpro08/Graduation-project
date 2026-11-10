import { DebateError, type DebateTopic, type DocumentResearch, type ResearchSource } from './debate.types';

/** 모델은 짧은 발췌 ID만 선택하고 인용 본문은 서버가 원문에서 연결한다. */
export function sourceSnippets(source:ResearchSource):{id:string;text:string}[]{
 const snippets:{id:string;text:string}[]=[];
 for(let start=0;start<Math.min(source.content.length,640);){
  let end=Math.min(start+160,source.content.length,640);
  const last=source.content.charCodeAt(end-1);
  if(last>=0xd800&&last<=0xdbff)end--;
  if(end<=start)break;
  snippets.push({id:`${source.id}p${snippets.length+1}`,text:source.content.slice(start,end)});start=end;
 }
 return snippets;
}
export function researchFields(value:unknown,topic:DebateTopic,research:DocumentResearch):DebateTopic{
 const v=value as Record<string,unknown>;
 if(!v||!Array.isArray(v.findings)||v.findings.length>4)throw new DebateError('AI_TOPIC_STRUCTURE');
 const findings=v.findings.map(raw=>{const f=raw as {text:string;sourceId:string;quote?:string;snippetId?:string};const source=research.sources.find(s=>s.id===f?.sourceId);
  const quote=source&&f.snippetId!==undefined?sourceSnippets(source).find(s=>s.id===f.snippetId)?.text:f?.quote;
  if(!source||typeof quote!=='string'||!quote.trim()||quote.length>180||!source.content.includes(quote))throw new DebateError('AI_TOPIC_EVIDENCE');
  if(f.snippetId!==undefined)return {text:quote.trim(),sourceId:f.sourceId,quote,snippetId:f.snippetId};
  if(typeof f.text!=='string'||!f.text.trim()||f.text.length>350)throw new DebateError('AI_TOPIC_EVIDENCE');
  return {text:f.text.trim(),sourceId:f.sourceId,quote};});
 const lines=(name:string)=>{const x=v[name];if(x===undefined)return [];if(!Array.isArray(x)||x.length>6||!x.every(a=>typeof a==='string'&&a.trim()&&a.length<=500))throw new DebateError('AI_TOPIC_STRUCTURE');return x as string[];};
 if(typeof v.goal!=='string'||!v.goal.trim()||v.goal.length>300)throw new DebateError('AI_TOPIC_STRUCTURE');
 const merge=(existing:string[]|undefined,added:string[],max:number)=>[...new Set([...(existing??[]),...added])].slice(0,max);
 // 조사 보완은 기존 질문·응답 구간·사용자 조건을 재작성하지 않는다.
 return {...topic,decisionGoal:topic.decisionGoal??v.goal.trim(),constraints:merge(topic.constraints,lines('constraints'),6),assumptions:merge(topic.assumptions,lines('assumptions'),6),facts:merge(topic.facts,findings.filter(f=>!f.snippetId).map(f=>`외부 자료(${f.sourceId}): ${f.text}`),12),research:{...research,findings}};
}
