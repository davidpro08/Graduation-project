import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import type { ChatMessage } from '../conversations/conversation.types';
import { AnalysisError, type AnalysisItem } from './analysis.types';
import { CLAIM_STORE,CLAIM_EXTRACTOR,CLAIM_JUDGE,validateClaims,type ClaimStore,type ClaimExtractor,type ClaimJudge,type ClaimReference } from './claims';
@Injectable()
export class ClaimPipeline {
  constructor(@Inject(CLAIM_STORE) private readonly store:ClaimStore,@Inject(CLAIM_EXTRACTOR) private readonly extractor:ClaimExtractor,@Inject(CLAIM_JUDGE) private readonly judge:ClaimJudge){}
  async prepare(user:AuthUser,conversationId:string,messages:ChatMessage[],signal:AbortSignal,before:()=>Promise<unknown>){
    const references:ClaimReference[]=[];let cached=0,extracted=0;
    for(const message of messages){
      signal.throwIfAborted();await before();
      let value=await this.store.load(user,conversationId,message);
      if(value){cached++;}else{
        value=validateClaims(await this.extractor.extract(message,signal),message);
        signal.throwIfAborted();await this.store.save(user,conversationId,message,value);
        value=await this.store.load(user,conversationId,message);if(!value)throw new AnalysisError('CLAIM_STORAGE_ERROR');extracted++;
      }
      references.push(...validateClaims(value,message).claims.map(claim=>({message,claim})));
    }
    return {references,cached,extracted};
  }
  async run(user:AuthUser,conversationId:string,messages:ChatMessage[],signal:AbortSignal,before:()=>Promise<unknown>){
    const {references,cached,extracted}=await this.prepare(user,conversationId,messages,signal,before);
    const limit=Number(process.env.CLAIM_MAX_PAIRS??'2000');if(!Number.isInteger(limit)||limit<1||limit>100000)throw new AnalysisError('AI_CONFIG_ERROR');
    const counts=new Map<string,number>();for(const ref of references)counts.set(ref.message.id,(counts.get(ref.message.id)??0)+1);
    const total=(references.length**2-[...counts.values()].reduce((n,c)=>n+c*c,0))/2;
    if(total>limit)throw new AnalysisError('CLAIM_PAIR_LIMIT');
    const decisions:{leftMessageId:string;rightMessageId:string;leftClaim:number;rightClaim:number;verdict:string;probabilities:number[]}[]=[];
    const items:AnalysisItem[]=[];let unknown=0,compared=0,model:string|null=null;
    for(let i=0;i<references.length;i++)for(let j=i+1;j<references.length;j++){
      const left=references[i],right=references[j];if(left.message.id===right.message.id)continue;
      signal.throwIfAborted();await before();const result=await this.judge.judge(left,right,signal);model=result.model;compared++;
      decisions.push({leftMessageId:left.message.id,rightMessageId:right.message.id,leftClaim:i,rightClaim:j,verdict:result.verdict,probabilities:result.probabilities});
      if(result.verdict==='unknown')unknown++;
      if(result.verdict==='contradiction')items.push({title:'명제 간 모순 가능성',summary:`JEV가 두 명제를 모순 후보로 분류했습니다. 원문과 조건을 확인하세요. 근거: “${left.claim.evidence.slice(0,600)}” / “${right.claim.evidence.slice(0,600)}”`,evidenceMessageIds:[left.message.id,right.message.id]});
    }
    if(items.length>1000)throw new AnalysisError('CLAIM_RESULT_LIMIT');
    return {items,metadata:{pipeline:'claims-v1',jevModel:model,decisions,scoreKind:'conditional_option_probability',extractedMessages:extracted,cachedMessages:cached,claimCount:references.length,comparedPairs:compared,unknownPairs:unknown,coverage:'complete',warnings:['JEV 분류는 모순 후보이며 정확도를 보장하지 않습니다.',...(unknown?['판단 불가 명제 쌍이 있습니다.']:[])]}};
  }
}
