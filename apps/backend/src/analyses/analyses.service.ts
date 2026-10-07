import { BadRequestException, ConflictException, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { noul } from '@typesafe-ai/sdk';
import type { AuthUser } from '../auth/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import type { ChatMessage } from '../conversations/conversation.types';
import { JevService } from '../ai/jev.service';
import { ANALYSIS_REPO, DETAIL_AI, AnalysisError, type AnalysisRepo, type DetailAi, type AnalysisItem, type AnalysisType, type ScheduleInput } from './analysis.types';

@Injectable()
export class AnalysesService implements OnModuleDestroy {
  private readonly active = new Map<string, AbortController>();
  private readonly workers = new Map<string, AuthUser>();
  constructor(@Inject(ANALYSIS_REPO) private readonly repo: AnalysisRepo,
    @Inject(DETAIL_AI) private readonly ai: DetailAi, private readonly chats: ConversationsService,
    private readonly jev: JevService) {}
  onModuleDestroy() { for (const controller of this.active.values()) controller.abort(); }
  async find(user: AuthUser, id: string) {
    let job = await this.repo.find(user, id);
    const worker=this.workers.get(id);
    if(worker?.id===user.id)worker.token=user.token;
    if (['pending','processing'].includes(job.status) && !this.active.has(id)) {
      await this.repo.state(user,id,'failed','JOB_INTERRUPTED'); job = await this.repo.find(user,id);
    }
    return job;
  }
  async latest(user: AuthUser, conversationId: string, type: AnalysisType) {
    await this.chats.find(user, conversationId);
    const job=await this.repo.latest(user,conversationId,type);
    return job ? this.find(user,job.id) : null;
  }
  async create(user: AuthUser, conversationId: string, type: AnalysisType, useJev: boolean) {
    await this.chats.find(user,conversationId);
    if(this.active.size>=4) throw new ConflictException('분석 중인 대화가 많습니다. 잠시 후 다시 시도해 주세요.');
    await this.latest(user,conversationId,type);
    if(this.active.size>=4) throw new ConflictException('분석 중인 대화가 많습니다. 잠시 후 다시 시도해 주세요.');
    const id=randomUUID(); const controller=new AbortController(); this.active.set(id,controller);
    try {
      const job=await this.repo.create(user,id,conversationId,type);
      const worker={...user};this.workers.set(id,worker);
      void this.run(worker,id,conversationId,type,useJev,controller).finally(()=>{this.active.delete(id);this.workers.delete(id);});
      return job;
    } catch(error) {this.active.delete(id);throw error;}
  }
  private async run(user: AuthUser,id:string,conversationId:string,type:AnalysisType,useJev:boolean,controller:AbortController) {
    const timeout=Number(process.env.ANALYSIS_TIMEOUT_MS ?? '7200000');
    const validTimeout=Number.isInteger(timeout)&&timeout>=60000&&timeout<=14400000;
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(validTimeout?timeout:7200000)]);
    try {
      if(!validTimeout)throw new AnalysisError('AI_CONFIG_ERROR');
      await this.repo.state(user,id,'processing');
      const messages:ChatMessage[]=[];
      for(let page=1;;page++) {
        signal.throwIfAborted();
        const batch=await this.chats.messages(user,conversationId,{page,pageSize:200});
        messages.push(...batch.items.filter(message=>message.kind==='text'));
        if(page*batch.pageSize>=batch.total)break;
      }
      const chunks:ChatMessage[][]=[];
      // 동일 근거 ID를 유지하며 긴 메시지를 나눈다. 분할 간 모순 탐지는 제한된다.
      let chunk:ChatMessage[]=[];let size=0;
      for(const message of messages) {
        const characters=Array.from(message.text);
        for(let offset=0;offset<characters.length;offset+=600) {
          const part={...message,text:characters.slice(offset,offset+600).join('')};
          const bytes=Buffer.byteLength(JSON.stringify(part));
          if(chunk.length && size+bytes>3000){chunks.push(chunk);chunk=[];size=0;}
          chunk.push(part);size+=bytes;
        }
      }
      if(chunk.length)chunks.push(chunk);
      const screened=new WeakSet<ChatMessage[]>();
      const items:AnalysisItem[]=[];let skippedChunks=0;let jevUsed=false;let model:string|null=null;
      const threshold=Number(process.env.JEV_SKIP_THRESHOLD ?? '0.2');
      if(!Number.isFinite(threshold)||threshold<0||threshold>1)throw new AnalysisError('AI_CONFIG_ERROR');
      for(let index=0;index<chunks.length;index++) {
        signal.throwIfAborted();
        await this.repo.find(user,id);
        const batch=chunks[index];
        if(!screened.has(batch)){
          const gate=await this.jev.evaluate({state:{messages:batch.map(message=>({...message}))},questions:{candidate:noul(type==='contradiction'?'같은 사람의 발언에 모순 가능성이 있나요?':'약속, 회의, 마감이나 일정에 대한 언급이 있나요?')}},{useJev});
          signal.throwIfAborted();
          if(gate.used){jevUsed=true;if(gate.result.answers.candidate.noul<threshold){skippedChunks++;continue;}}
          screened.add(batch);
        }
        const count=await this.ai.count(type,batch,signal);
        if(count.count>count.limit) {
          let parts:ChatMessage[][];
          if(batch.length===1){
            const chars=Array.from(batch[0].text);if(chars.length<2)throw new AnalysisError('AI_CONTEXT_ERROR');
            const half=Math.ceil(chars.length/2);parts=[[{...batch[0],text:chars.slice(0,half).join('')}],[{...batch[0],text:chars.slice(half).join('')}]];
          }else{const middle=Math.ceil(batch.length/2);parts=[batch.slice(0,middle),batch.slice(middle)];}
          for(const part of parts)screened.add(part);
          chunks.splice(index,1,...parts);
          index--;continue;
        }
        const result=await this.ai.analyze(type,batch,signal);items.push(...result.items);model=result.model;
      }
      const unique=[...new Map(items.map(item=>[JSON.stringify({...item,evidenceMessageIds:[...item.evidenceMessageIds].sort()}),item])).values()];
      signal.throwIfAborted();
      await this.repo.complete(user,id,unique,{jevUsed,qwenModel:model,chunks:chunks.length,skippedChunks,
        warnings:chunks.length>1?['대화를 나눠 분석했습니다. 서로 다른 구간에 있는 발언의 모순은 누락될 수 있습니다.']:[]});
    } catch(error) {
      const code=signal.aborted?'ANALYSIS_TIMEOUT':error instanceof AnalysisError?error.code:'ANALYSIS_FAILED';
      try{await this.repo.state(user,id,'failed',code);}catch{/* 대화 삭제 또는 DB 장애 시 다음 조회에서 중단 상태를 복구한다. */}
    }
  }
  async result(user:AuthUser,id:string){const job=await this.find(user,id);if(job.status!=='completed')throw new ConflictException('분석이 아직 완료되지 않았습니다.');return {items:job.result!.items,metadata:job.metadata};}
  async schedules(user:AuthUser,id:string){await this.chats.find(user,id);return this.repo.schedules(user,id);}
  saveSchedule(user:AuthUser,id:string,input:ScheduleInput,confirm:boolean){
    const parsed=new Date(`${input.date}T00:00:00Z`);
    if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==input.date||!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))throw new BadRequestException('올바른 날짜와 시간을 입력해 주세요.');
    if(input.endTime!==undefined&&(!/^([01]\d|2[0-3]):[0-5]\d$/.test(input.endTime)||input.endTime<=input.time))throw new BadRequestException('종료 시간은 같은 날의 시작 시간 이후로 선택해 주세요.');
    return this.repo.saveSchedule(user,id,input,confirm);
  }
}
