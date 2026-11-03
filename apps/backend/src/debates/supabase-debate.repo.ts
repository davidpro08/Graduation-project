import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { SupabaseService } from '../supabase/supabase.service';
import { type DebateDocument, type DebateRepo, type DebateJob, type DebateResult, type PersonaFilters } from './debate.types';

type Row = { id: string; conversation_id: string; input: string; filters: PersonaFilters; speaker_ids: string[]; document: DebateDocument | null; revision: number; status: DebateJob['status']; stage: string; processed: number; selected: number; error_code: string | null; result: DebateResult | null; created_at: string };
const job = (row: Row): DebateJob => ({ id: row.id, conversationId: row.conversation_id, input: row.input, filters: row.filters,
  speakerIds: row.speaker_ids, document: row.document, revision: row.revision, status: row.status, stage: row.stage, processed: row.processed, selected: row.selected, errorCode: row.error_code, result: row.result ?? null, createdAt: row.created_at });
const unavailable = () => new ServiceUnavailableException('페르소나 분석 저장소에 연결하지 못했습니다. DB 마이그레이션과 연결을 확인해 주세요.');

@Injectable()
export class SupabaseDebateRepo implements DebateRepo {
  constructor(private readonly db: SupabaseService) {}
  async create(user: AuthUser, id: string, conversationId: string, input: string, filters: PersonaFilters, speakerIds: string[]) {
    const { data, error } = await this.db.forUser(user.token).from('persona_debates').insert({ id, conversation_id: conversationId, owner_id: user.id, input, filters, speaker_ids: speakerIds }).select().single();
    if (error?.code === '23505') throw new ConflictException('이 대화의 페르소나 분석이 이미 진행 중입니다.');
    if (error || !data) throw unavailable(); return job(data as Row);
  }
  async find(user: AuthUser, id: string) {
    const { data, error } = await this.db.forUser(user.token).from('persona_debates').select('*').eq('owner_id', user.id).eq('id', id).maybeSingle();
    if (error) throw unavailable(); if (!data) throw new NotFoundException('페르소나 분석을 찾을 수 없습니다.'); return job(data as Row);
  }
  async latest(user: AuthUser, conversationId: string) {
    const { data, error } = await this.db.forUser(user.token).from('persona_debates').select('*').eq('owner_id', user.id).eq('conversation_id', conversationId).order('created_at', { ascending: false }).order('id').limit(1).maybeSingle();
    if (error) throw unavailable(); return data ? job(data as Row) : null;
  }
  async history(user: AuthUser, conversationId: string, page: number) {
    const { data, error, count } = await this.db.forUser(user.token).from('persona_debates')
      .select('id,conversation_id,input,filters,speaker_ids,revision,status,stage,processed,selected,error_code,created_at', { count: 'exact' })
      .eq('owner_id', user.id).eq('conversation_id', conversationId).order('created_at', { ascending: false }).order('id').range((page - 1) * 20, page * 20 - 1);
    if (error || !data) throw unavailable(); return { items: (data as Row[]).map(job), total: count ?? 0 };
  }
  async review(user: AuthUser, id: string, document: DebateDocument) {
    await this.update(user, id, { status: 'review', stage: 'review', document, revision: 1 });
  }
  async saveDocument(user: AuthUser, id: string, revision: number, document: DebateDocument) {
    const { data, error } = await this.db.forUser(user.token).from('persona_debates').update({ document, revision: revision + 1, updated_at: new Date().toISOString() })
      .eq('owner_id', user.id).eq('id', id).eq('status', 'review').eq('revision', revision).select().maybeSingle();
    if (error) throw unavailable(); if (!data) throw new ConflictException('문서가 다른 화면에서 변경됐습니다. 다시 불러와 주세요.'); return job(data as Row);
  }
  async claim(user: AuthUser, id: string, revision: number) {
    const { data, error } = await this.db.forUser(user.token).from('persona_debates').update({ status: 'processing', stage: 'sampling', error_code: null, updated_at: new Date().toISOString() })
      .eq('owner_id', user.id).eq('id', id).eq('status', 'review').eq('revision', revision).select().maybeSingle();
    if (error?.code === '23505') throw new ConflictException('이 대화에서 다른 분석이 진행 중입니다.');
    if (error) throw unavailable(); if (!data) throw new ConflictException('문서가 변경됐거나 이미 분석을 시작했습니다. 다시 불러와 주세요.'); return job(data as Row);
  }
  private async update(user: AuthUser, id: string, value: Record<string, unknown>) {
    const { data, error } = await this.db.forUser(user.token).from('persona_debates').update({ ...value, updated_at: new Date().toISOString() })
      .eq('owner_id', user.id).eq('id', id).in('status', ['pending', 'processing']).select('id').maybeSingle();
    if (error || !data) throw unavailable();
  }
  progress(user: AuthUser, id: string, stage: string, processed: number, selected: number, document?:DebateDocument) { return this.update(user, id, { status: 'processing', stage, processed, selected,...(document?{document}: {}) }); }
  finish(user: AuthUser, id: string, result: DebateResult) { return this.update(user, id, { status: 'completed', stage: 'completed', result, processed: result.selected, selected: result.selected }); }
  fail(user: AuthUser, id: string, code: string) { return this.update(user, id, { status: 'failed', stage: 'failed', error_code: code }); }
}

