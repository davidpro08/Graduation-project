import type { ChatMessage } from '../conversations/conversation.types';
import { DebateError, type DebateDocument, type DebateTopic } from './debate.types';
import { validateSchema } from './answer-schema';
const line=(v:unknown,max:number):v is string=>typeof v==='string'&&!!v.trim()&&v.length<=max;
export function documentTemplate(input:string,messages:ChatMessage[]=[]):DebateDocument {
 return {draftOnly:true,question:input.slice(0,300),proposition:'사용자 질문의 판단 기준 확인 필요',summary:'문서 틀을 준비했습니다. 짧은 요약과 응답 기준을 정리하고 있습니다.',context:messages.length?'사용자가 직접 선택한 발언입니다. 전체 대화를 조사하지 않았습니다.':'직접 선택한 대화가 없습니다.',keyIssues:[],supportingLogic:[],opposingLogic:[],facts:[],evidenceMessageIds:messages.map(m=>m.id),statements:messages.map(m=>({messageId:m.id,participantId:m.participantId,speaker:m.speaker,text:m.text}))};
}
/** AI는 요약·쟁점·응답 기준만 반환한다. 원문·질문·출처·분류 라벨은 서버가 구성한다. */
export function compactDocument(value:unknown,input:string,messages:ChatMessage[]):DebateTopic {
 const v=value as Record<string,unknown>;
 if(!v||typeof v!=='object'||!line(v.summary,800)||!line(v.basis,150)||!['stance','numeric','choice'].includes(String(v.kind)))throw new DebateError('AI_TOPIC_STRUCTURE');
 const lines=(x:unknown)=>{if(x===undefined)return [];if(!Array.isArray(x)||x.length>6||!x.every(s=>line(s,120)))throw new DebateError('AI_TOPIC_STRUCTURE');return x as string[];};
 const issues=lines(v.issues),unknowns=lines(v.unknowns);
 let options:{id:string;label:string;min?:number;max?:number|null}[];
 if(v.kind==='numeric'){
   if(!line(v.unit,30)||!Array.isArray(v.bounds)||v.bounds.length<2||v.bounds.length>4||!v.bounds.every(n=>typeof n==='number'&&Number.isFinite(n))||v.bounds.some((n,i)=>i>0&&n<=Number((v.bounds as number[])[i-1])))throw new DebateError('AI_TOPIC_STRUCTURE');
   const bounds=v.bounds as number[];options=bounds.map((min,i)=>({id:`o${i+1}`,label:'수치 구간',min,max:bounds[i+1]??null}));
 }else if(v.kind==='stance')options=[{id:'o1',label:'질문의 평가·주장에 동의'},{id:'o2',label:'질문의 평가·주장에 반대'},{id:'o3',label:'중립/조건부 판단'}];
 else{if(!Array.isArray(v.choices)||v.choices.length<2||v.choices.length>3||!v.choices.every(c=>line(c,60))||new Set(v.choices).size!==v.choices.length)throw new DebateError('AI_TOPIC_STRUCTURE');options=v.choices.map((label,i)=>({id:`o${i+1}`,label:label as string}));}
 options.push({id:'o0',label:'정보 부족/판단 보류'});
 const schema=validateSchema({kind:v.kind,unit:v.kind==='numeric'?v.unit:'',basis:v.basis,options});
 const summary=messages.length||v.findings?v.summary.trim():'질문만 제공됐습니다. 관련 사실과 판단 기준을 확인해 주세요.';
 const researchQueries=Array.isArray(v.researchQueries)?v.researchQueries.filter(q=>line(q,150)).slice(0,3) as string[]:[];
 return {researchQueries,question:input.slice(0,300),proposition:v.basis.trim(),summary,context:summary,keyIssues:issues,supportingLogic:[],opposingLogic:[],facts:unknowns.map(x=>`미확인: ${x}`),answerSchema:schema,evidenceMessageIds:messages.map(m=>m.id)};
}
