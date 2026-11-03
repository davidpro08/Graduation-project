import { BadRequestException, ConflictException, Inject, Injectable, Optional, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChatMessage } from '../conversations/conversation.types';
import type { AuthUser } from '../auth/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import { aggregate } from './debate.statistics';
import { analysisTopic, editDocument, prepareDocument } from './debate.document';
import { composeMarkdown } from './debate-markdown';
import { PERSONA_LIMIT, allocatePersonas, personaBudget } from '../personas/persona.policy';
import { DEBATE_AI, DEBATE_REPO, PERSONA_SOURCE, JEV_OPINIONS, DebateError,
  type DebateAi, type DebateRepo, type PersonaSource, type JevOpinions, type PersonaFilters,
  DOCUMENT_RESEARCH, type ResearchProvider, type DebateDocument, type DebateTopic, type DocumentEdit, type Persona, type PersonaResponse } from './debate.types';

@Injectable()
export class DebatesService implements OnModuleDestroy {
  private readonly budget = personaBudget();
  private readonly active = new Map<string, { controller: AbortController; user: AuthUser }>();
  constructor(@Inject(DEBATE_REPO) private readonly repo: DebateRepo,
    @Inject(PERSONA_SOURCE) private readonly personas: PersonaSource,
    @Inject(DEBATE_AI) private readonly ai: DebateAi,
    @Inject(JEV_OPINIONS) private readonly jev: JevOpinions,
    private readonly chats: ConversationsService,@Optional() @Inject(DOCUMENT_RESEARCH) private readonly research?:ResearchProvider) {}
  onModuleDestroy() { for (const worker of this.active.values()) worker.controller.abort(); }
  async facets(user: AuthUser, conversationId: string) { await this.chats.find(user, conversationId); return (await this.personas.facets({ user, conversationId })).values; }
  async preview(user: AuthUser, conversationId: string, filters: PersonaFilters) {
    await this.chats.find(user, conversationId);
    const selection = await this.personas.select(filters, `${user.id}:preview`, true, { user, conversationId });
    return { eligible: selection.eligible, ...allocatePersonas(selection.eligible, this.budget) };
  }
  async find(user: AuthUser, id: string) {
    let job = await this.repo.find(user, id);
    const worker = this.active.get(id);
    if (worker?.user.id === user.id) worker.user.token = user.token;
    if (['pending', 'processing'].includes(job.status) && !worker) {
      await this.repo.fail(user, id, 'JOB_INTERRUPTED'); job = await this.repo.find(user, id);
    }
    return job;
  }
  async latest(user: AuthUser, conversationId: string) {
    await this.chats.find(user, conversationId);
    const job = await this.repo.latest(user, conversationId);
    return job ? this.find(user, job.id) : null;
  }
  async history(user: AuthUser, conversationId: string, page: number) {
    await this.chats.find(user, conversationId); return this.repo.history(user, conversationId, page);
  }
  async create(user: AuthUser, conversationId: string, input: string, filters: PersonaFilters, speakerIds: string[] = [],messageIds:string[] = [],seed?:DebateDocument,queries?:string[]) {
    const conversation = await this.chats.find(user, conversationId);
    const participants = new Set((conversation.participants ?? []).map(person => person.id));
    if (speakerIds.some(id => !participants.has(id))) throw new BadRequestException('이 대화의 참여자만 선택할 수 있습니다.');
    if (this.active.size >= 2) throw new ConflictException('진행 중인 페르소나 분석이 많습니다. 잠시 후 다시 시도해 주세요.');
    const selectedMessages=messageIds.length?await this.chats.selectedMessages(user,conversationId,messageIds):[];
    const id = randomUUID(), worker = { user: { ...user }, controller: new AbortController() };
    this.active.set(id, worker);
    try {
      await this.latest(user, conversationId);
      const job = await this.repo.create(user, id, conversationId, input.trim(), filters, speakerIds);
      void this.prepare(worker.user, id, conversationId, input.trim(), speakerIds, worker.controller,selectedMessages,filters,seed,queries)
        .finally(() => this.active.delete(id));
      return job;
    } catch (error) { this.active.delete(id); throw error; }
  }
  async restart(user:AuthUser,id:string,mode:'document'|'opinions'){
    const original=await this.find(user,id);
    if(original.status!=='failed')throw new ConflictException('실패한 분석만 다시 시작할 수 있습니다.');
    if(mode==='document')return this.create(user,original.conversationId,original.input,original.filters,original.speakerIds,original.document?.selectedMessageIds??[]);
    if(!original.document||original.document.draftOnly)throw new BadRequestException('저장된 문서가 없습니다. 문서부터 다시 만들어 주세요.');
    await this.chats.find(user,original.conversationId);
    if(this.active.has(id)||this.active.size>=2)throw new ConflictException('진행 중인 작업이 있습니다. 잠시 후 다시 시도해 주세요.');
    const nextId=randomUUID(),worker={user:{...user},controller:new AbortController()};
    this.active.set(nextId,worker);
    try{
      await this.latest(user,original.conversationId);
      await this.repo.create(user,nextId,original.conversationId,original.input,original.filters,original.speakerIds);
      await this.repo.review(user,nextId,original.document);
      const next=await this.repo.claim(user,nextId,1);
      void this.run(worker.user,nextId,next.conversationId,next.filters,analysisTopic(original.document),worker.controller).finally(()=>this.active.delete(nextId));
      return next;
    }catch(error){this.active.delete(nextId);try{await this.repo.fail(user,nextId,'DEBATE_FAILED');}catch{/* 생성되지 않은 기록일 수 있다. */}throw error;}
  }
  async saveDocument(user: AuthUser, id: string, edit: DocumentEdit) {
    const job = await this.find(user, id);
    if (job.status !== 'review' || !job.document) throw new ConflictException('수정할 수 있는 쟁점 문서가 아닙니다.');
    return this.repo.saveDocument(user, id, edit.revision, editDocument(job.document, edit,job.filters));
  }
  async composeDocument(user:AuthUser,id:string,edit:DocumentEdit){
    const job=await this.find(user,id);
    if(!job.document)throw new BadRequestException('조합할 문서가 없습니다.');
    if(job.revision!==edit.revision)throw new ConflictException('문서가 다른 화면에서 변경됐습니다. 다시 불러와 주세요.');
    return {markdown:composeMarkdown(editDocument(job.document,edit,job.filters),job.filters)};
  }
  async researchDocument(user:AuthUser,id:string,revision:number,queries:string[]){
    const job=await this.find(user,id);
    if(job.status!=='review'||!job.document||job.document.draftOnly)throw new ConflictException('검토 중인 문서에서만 다시 조사할 수 있습니다.');
    if(job.revision!==revision)throw new ConflictException('문서가 다른 화면에서 변경됐습니다. 다시 불러와 주세요.');
    return this.create(user,job.conversationId,job.document.question,job.filters,job.speakerIds,job.document.selectedMessageIds??job.document.statements.map(s=>s.messageId),{...job.document,basedOn:{id:job.id,revision:job.revision}},queries);
  }
  async start(user: AuthUser, id: string, revision: number) {
    const job = await this.find(user, id);
    if (job.status !== 'review' || !job.document || job.document.draftOnly) throw new ConflictException('문서 정리가 완료된 후 분석을 시작해 주세요.');
    if(job.document.researchUpdated)throw new ConflictException('새 조사 결과를 최종 문서에 반영하거나 편집본을 확인하고 저장해 주세요.');
    if (this.active.has(id) || this.active.size >= 2) throw new ConflictException('진행 중인 분석이 있습니다. 잠시 후 다시 시도해 주세요.');
    const worker = { user: { ...user }, controller: new AbortController() };
    this.active.set(id, worker);
    try {
      const claimed = await this.repo.claim(user, id, revision);
      void this.run(worker.user, id, claimed.conversationId, claimed.filters, analysisTopic(claimed.document!), worker.controller).finally(() => this.active.delete(id));
      return claimed;
    } catch (error) { this.active.delete(id); throw error; }
  }
  private async prepare(user: AuthUser, id: string, conversationId: string, input: string, speakerIds: string[], controller: AbortController,selectedMessages:ChatMessage[]=[],filters:PersonaFilters={},seed?:DebateDocument,queries?:string[]) {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(7200000)]);
    try {
      await this.repo.progress(user, id, 'refining', 0, 0);
      const document = await prepareDocument(this.ai, this.chats, user, conversationId, input, speakerIds, signal,300,document=>this.repo.progress(user,id,'refining',0,0,document),selectedMessages,this.research,seed,queries,filters);
      signal.throwIfAborted();
      await this.repo.review(user, id, document);
    } catch (error) {
      const code = error instanceof DebateError ? error.code : signal.aborted ? 'DEBATE_TIMEOUT' : 'DEBATE_FAILED';
      try { await this.repo.fail(user, id, code); } catch { /* 다음 조회에서 중단 작업을 정리한다. */ }
    }
  }
  private async run(user: AuthUser, id: string, conversationId: string, filters: PersonaFilters, topic: DebateTopic, controller: AbortController) {
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(7200000)]);
    try {
      await this.repo.progress(user, id, 'sampling', 0, 0);
      const selection = await this.personas.select(filters, id, false, { user, conversationId });
      if (!selection.personas.length) throw new DebateError('NO_PERSONAS');
      if (selection.personas.length > PERSONA_LIMIT || new Set(selection.personas.map(p => p.id)).size !== selection.personas.length) throw new DebateError('PERSONA_INVALID_SAMPLE');
      const { eligible } = selection, personas = selection.personas.slice(0, this.budget.total);
      const { detail, jev } = allocatePersonas(personas.length, this.budget);
      if (detail) this.ai.ready();
      if (jev) this.jev.ready();
      const responses: PersonaResponse[] = [];
      // 동시 저장의 역전 없이 진행률을 단조 증가시킨다. 모델 호출은 소수 worker로 제한한다.
      let progress = Promise.resolve();
      let fatalCause:DebateError|null=null;
      const runGroup = async (group: Persona[], mode: 'detail' | 'jev', concurrency: number) => {
        let cursor = 0;
        let fatal: DebateError | null = null;
        const workers = await Promise.allSettled(Array.from({ length: Math.min(concurrency, group.length) }, async () => {
          while (cursor < group.length) {
            signal.throwIfAborted();
            const persona = group[cursor++];
            const { persona: _description, ...profile } = persona; void _description;
            let row: PersonaResponse;
            try {
              const result = await (mode === 'detail' ? this.ai : this.jev).respond(topic!, persona, signal);
              row = { persona: profile, mode, status: 'completed', ...result };
            } catch (error) {
              const code = error instanceof DebateError ? error.code : 'AI_UNAVAILABLE';
              if (signal.aborted || ['AI_UNAVAILABLE', 'JEV_UNAVAILABLE', 'AI_AUTH_ERROR', 'JEV_AUTH_ERROR', 'JEV_NOT_CONFIGURED'].includes(code)) { fatalCause ??= new DebateError(code); fatal ??= fatalCause; controller.abort(); throw fatal; }
              row = { persona: profile, mode, status: 'failed', errorCode: code };
            }
            responses.push(row);
            const processed = responses.length;
            progress = progress.then(() => this.repo.progress(user, id, responses.filter(r=>r.mode==='detail').length>=detail?'jev':'detail', processed, personas.length));
            await progress;
          }
        }));
        if (fatal) throw fatal;
        const rejected = workers.find(worker => worker.status === 'rejected');
        if (rejected?.status === 'rejected') throw rejected.reason;
      };
      const groups=await Promise.allSettled([runGroup(personas.slice(0, detail),'detail',2),runGroup(personas.slice(detail),'jev',4)]);
      if(fatalCause)throw fatalCause;
      const failedGroup=groups.find(group=>group.status==='rejected');if(failedGroup?.status==='rejected')throw failedGroup.reason;
      signal.throwIfAborted();
      if (!responses.some(row => row.status === 'completed')) throw new DebateError('NO_VALID_RESPONSES');
      // 표본 순서를 보존하여 재조회와 개별 응답 목록이 안정적으로 유지되게 한다.
      responses.sort((a, b) => personas.findIndex(p => p.id === a.persona.id) - personas.findIndex(p => p.id === b.persona.id));
      await this.repo.finish(user, id, { topic, filters, eligible, selected: personas.length,
        detailTarget: detail, jevTarget: jev, responses, statistics: aggregate(responses,{},topic.answerSchema) });
    } catch (error) {
      const code = error instanceof DebateError ? error.code : signal.aborted ? 'DEBATE_TIMEOUT' : 'DEBATE_FAILED';
      try { await this.repo.fail(user, id, code); } catch { /* 다음 소유자 조회 시 중단 작업으로 복구한다. */ }
    }
  }
  async result(user: AuthUser, id: string, filters: PersonaFilters) {
    const job = await this.find(user, id);
    if (job.status !== 'completed' || !job.result) throw new ConflictException('분석이 아직 완료되지 않았습니다.');
    const statistics = aggregate(job.result.responses, filters,job.result.topic.answerSchema);
    return { ...job.result, statistics };
  }
}
