import { BadRequestException, ConflictException, Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import type { ChatMessage } from '../conversations/conversation.types';
import { recentAnalysisWindow } from './analysis-window';
import { AnalysisRunner } from './analysis-runner';
import { ANALYSIS_REPO, DETAIL_AI, AnalysisError, type AnalysisRepo, type DetailAi, type AnalysisType, type ScheduleInput } from './analysis.types';

@Injectable()
export class AnalysesService implements OnModuleDestroy {
  private readonly active = new Map<string, AbortController>();
  private readonly workers = new Map<string, AuthUser>();
  constructor(@Inject(ANALYSIS_REPO) private readonly repo: AnalysisRepo,
    @Inject(DETAIL_AI) private readonly ai: DetailAi, private readonly chats: ConversationsService) {}
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
  async create(user: AuthUser, conversationId: string, type: AnalysisType) {
    await this.chats.find(user,conversationId);
    if(this.active.size>=4) throw new ConflictException('분석 중인 대화가 많습니다. 잠시 후 다시 시도해 주세요.');
    await this.latest(user,conversationId,type);
    if(this.active.size>=4) throw new ConflictException('분석 중인 대화가 많습니다. 잠시 후 다시 시도해 주세요.');
    const id=randomUUID(); const controller=new AbortController(); this.active.set(id,controller);
    try {
      const job=await this.repo.create(user,id,conversationId,type);
      const worker={...user};this.workers.set(id,worker);
      void this.run(worker,id,conversationId,type,controller).finally(()=>{this.active.delete(id);this.workers.delete(id);});
      return job;
    } catch(error) {this.active.delete(id);throw error;}
  }
  private async run(user: AuthUser,id:string,conversationId:string,type:AnalysisType,controller:AbortController) {
    const timeout=Number(process.env.ANALYSIS_TIMEOUT_MS ?? '7200000');
    const validTimeout=Number.isInteger(timeout)&&timeout>=60000&&timeout<=14400000;
    const signal=AbortSignal.any([controller.signal,AbortSignal.timeout(validTimeout?timeout:7200000)]);
    try {
      if(!validTimeout)throw new AnalysisError('AI_CONFIG_ERROR');
      await this.repo.state(user,id,'processing');
      const conversation = await this.chats.find(user,conversationId);
      const window = recentAnalysisWindow(conversation.endDate);
      const messages:ChatMessage[]=[];
      for(let page=1;;page++) {
        signal.throwIfAborted();
        const batch=await this.chats.messages(user,conversationId,{...window,page,pageSize:200});
        messages.push(...batch.items.filter(message=>message.kind==='text' && message.date>=window.from && message.date<=window.to));
        if(page*batch.pageSize>=batch.total)break;
      }
      const result=await new AnalysisRunner(this.ai).run(type,messages,signal,()=>this.repo.find(user,id));
      signal.throwIfAborted();
      await this.repo.complete(user,id,result.items,{...result.metadata,
        inputRange:{...window,anchor:'conversation_end',messageCount:messages.length}});
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
