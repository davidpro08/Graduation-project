import { DebateError, type DebateTopic, type FactEvidence } from './debate.types';
import type { ChatMessage } from '../conversations/conversation.types';
const labels={reported:'대화에 나온 정보(외부 검증 전)',opinion:'참여자의 의견',assumption:'가정',unknown:'미확인'};
/** 인용의 존재를 검증한다. 인용이 사실인지/요약이 의미적으로 타당한지는 별도 검토가 필요하다. */
export function groundedFacts(value:unknown,messages:ChatMessage[],previous:DebateTopic|null):FactEvidence[]{
  if(value===undefined)return [];
  if(!Array.isArray(value)||value.length>8)throw new DebateError('AI_TOPIC_STRUCTURE');
  return value.map(raw=>{
    if(!raw||typeof raw!=='object')throw new DebateError('AI_TOPIC_STRUCTURE');
    const v=raw as FactEvidence;
    if(!Object.hasOwn(labels,v.kind)||typeof v.text!=='string'||!v.text.trim()||v.text.length>300)throw new DebateError('AI_TOPIC_STRUCTURE');
    if(v.kind==='assumption'||v.kind==='unknown')return {text:v.text.trim(),kind:v.kind,messageId:null,quote:null};
    if(typeof v.messageId!=='string'||typeof v.quote!=='string'||!v.quote.trim()||v.quote.length>500)throw new DebateError('AI_TOPIC_EVIDENCE');
    const current=messages.find(m=>m.id===v.messageId);
    const old=previous?.factEvidence?.some(f=>f.messageId===v.messageId&&f.quote===v.quote&&f.text===v.text&&f.kind===v.kind);
    if(!(current?.text.includes(v.quote)||old))throw new DebateError('AI_TOPIC_EVIDENCE');
    return {text:v.text.trim(),kind:v.kind,messageId:v.messageId,quote:v.quote};
  });
}
export function factLines(facts:FactEvidence[]){return facts.map(f=>`${labels[f.kind]}: ${f.text}`);}
