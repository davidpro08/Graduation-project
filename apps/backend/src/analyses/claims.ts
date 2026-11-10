import { createHash } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types';
import type { ChatMessage } from '../conversations/conversation.types';
import { AnalysisError } from './analysis.types';
export interface Claim { evidence:string; subject:string|null; predicate:string; object:string|null; polarity:'positive'|'negative'|'uncertain'; qualifiers:string[] }
export interface MessageClaims { message_id:string; original_text?:string; claims:Claim[] }
export const CLAIM_STORE=Symbol('CLAIM_STORE'), CLAIM_EXTRACTOR=Symbol('CLAIM_EXTRACTOR'), CLAIM_JUDGE=Symbol('CLAIM_JUDGE');
export const claimVersion=()=>`claims-v1:${process.env.SCHOOL_AI_MODEL || 'Qwen/Qwen3-32B-AWQ'}`;
export const sourceHash=(message:ChatMessage)=>createHash('sha256').update(JSON.stringify([message.text,message.participantId,message.speaker,message.date,message.time])).digest('hex');
export interface ClaimStore {
  load(user:AuthUser,conversationId:string,message:ChatMessage):Promise<MessageClaims|null>;
  save(user:AuthUser,conversationId:string,message:ChatMessage,value:MessageClaims):Promise<void>;
}
export interface ClaimExtractor { extract(message:ChatMessage,signal:AbortSignal):Promise<MessageClaims> }
export interface ClaimReference { message:ChatMessage; claim:Claim }
export type Verdict='contradiction'|'compatible'|'unknown';
export interface ClaimJudge { judge(left:ClaimReference,right:ClaimReference,signal:AbortSignal):Promise<{verdict:Verdict; probabilities:number[]; model:string}> }
const record=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
const nonempty=(x:unknown):x is string=>typeof x==='string'&&x.length>0;
export function validateClaims(value:unknown,message:ChatMessage):MessageClaims {
  const fail=():never=>{throw new AnalysisError('AI_INVALID_CLAIMS');};
  if(!record(value)||Object.keys(value).some(k=>!['message_id','original_text','claims'].includes(k))||value.message_id!==message.id||
    (value.original_text!==undefined&&value.original_text!==message.text)||!Array.isArray(value.claims))return fail();
  for(const claim of value.claims){
    if(!record(claim)||Object.keys(claim).length!==6||Object.keys(claim).some(k=>!['evidence','subject','predicate','object','polarity','qualifiers'].includes(k))||
      !nonempty(claim.evidence)||!message.text.includes(claim.evidence)||!nonempty(claim.predicate)||
      !(claim.subject===null||typeof claim.subject==='string')||!(claim.object===null||typeof claim.object==='string')||
      !['positive','negative','uncertain'].includes(String(claim.polarity))||!Array.isArray(claim.qualifiers)||!claim.qualifiers.every(nonempty))return fail();
  }
  return {message_id:message.id,original_text:message.text,claims:value.claims as unknown as Claim[]};
}
