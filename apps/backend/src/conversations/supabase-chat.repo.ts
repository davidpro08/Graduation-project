import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { AuthUser } from '../auth/auth.types';
import type { ConversationRepository } from './conversation.repository';
import type { ChatFilter, ChatUpload, Conversation, MessagePage, Statistics } from './conversation.types';

interface ChatRow {
  id: string; title: string; message_count: number; start_date: string; end_date: string;
  created_at: string; warnings: string[]; participants: { id: string; name: string; color_index: number }[];
}
const SELECT = 'id,title,message_count,start_date,end_date,created_at,warnings,participants(id,name,color_index)';
function convert(row: ChatRow): Conversation {
  return { id: row.id, title: row.title, messageCount: row.message_count, startDate: row.start_date,
    endDate: row.end_date, createdAt: row.created_at, warnings: row.warnings,
    participants: row.participants.sort((a,b) => a.color_index-b.color_index).map(p => ({ id:p.id,name:p.name,colorIndex:p.color_index })) };
}
function unavailable(): never { throw new ServiceUnavailableException('대화 저장 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.'); }

@Injectable()
export class SupabaseChatRepo implements ConversationRepository {
  constructor(private readonly supabase: SupabaseService) {}
  async list(user: AuthUser, page: number, search?: string) {
    try {
      let query = this.supabase.forUser(user.token).from('conversations').select(SELECT, { count:'exact' }).eq('owner_id',user.id);
      if (search) query=query.ilike('title',`%${search.replace(/[\\%_]/g,'\\$&')}%`);
      const { data, error, count } = await query.order('created_at',{ascending:false}).order('id').range((page-1)*20,page*20-1);
      if (error || !data) return unavailable();
      return { items:(data as unknown as ChatRow[]).map(convert),total:count ?? 0 };
    } catch { return unavailable(); }
  }
  async find(user: AuthUser, id: string) {
    const { data,error } = await this.supabase.forUser(user.token).from('conversations').select(SELECT).eq('owner_id',user.id).eq('id',id).maybeSingle();
    if (error) return unavailable();
    if (!data) throw new NotFoundException('대화를 찾을 수 없습니다.');
    return convert(data as unknown as ChatRow);
  }
  async sourceHash(user: AuthUser, id: string) {
    const { data,error } = await this.supabase.forUser(user.token).from('conversations').select('source_hash').eq('owner_id',user.id).eq('id',id).maybeSingle();
    if (error) return unavailable();
    return (data?.source_hash as string | undefined) ?? null;
  }
  async create(user: AuthUser, upload: ChatUpload) {
    const { error } = await this.supabase.forUser(user.token).rpc('import_conversation', { p_id:upload.id,p_title:upload.title,
      p_source_hash:upload.sourceHash,p_participants:upload.parsed.participants,p_messages:upload.parsed.messages,p_warnings:upload.parsed.warnings });
    if (error) return unavailable();
  }
  async remove(user: AuthUser, id: string) {
    const { error } = await this.supabase.forUser(user.token).from('conversations').delete().eq('owner_id',user.id).eq('id',id);
    if (error) return unavailable();
  }
  async messages(user: AuthUser, id: string, filter: ChatFilter): Promise<MessagePage> {
    if(filter.messageId){
      const {data,error}=await this.supabase.forUser(user.token).from('messages').select('sequence').eq('owner_id',user.id).eq('conversation_id',id).eq('id',filter.messageId).maybeSingle();
      if(error)return unavailable();if(!data)throw new NotFoundException('근거 메시지를 찾을 수 없습니다.');
      // sequence는 0부터 시작한다. 근거 링크는 필터를 해제하고 해당 페이지를 조회한다.
      return this.messages(user,id,{page:Math.floor(Number(data.sequence)/(filter.pageSize??100))+1,pageSize:filter.pageSize});
    }
    let query = this.supabase.forUser(user.token).from('messages').select('id,sequence,participant_id,message_date,message_time,body,kind,participants(name)',{count:'exact'})
      .eq('owner_id',user.id).eq('conversation_id',id);
    if (filter.from) query=query.gte('message_date',filter.from);
    if (filter.to) query=query.lte('message_date',filter.to);
    if (filter.participantId) query=query.eq('participant_id',filter.participantId);
    if (filter.search) query=query.ilike('body',`%${filter.search.replace(/[\\%_]/g,'\\$&')}%`);
    const page=filter.page ?? 1,pageSize=filter.pageSize ?? 100;
    const { data,error,count }=await query.order('sequence').range((page-1)*pageSize,page*pageSize-1);
    if (error || !data) return unavailable();
    return { items:data.map(row => ({id:row.id as string,sequence:row.sequence as number,participantId:row.participant_id as string|null,
      speaker:(row.participants as unknown as {name:string}|null)?.name ?? '시스템',date:row.message_date as string,
      time:(row.message_time as string|null)?.slice(0,5) ?? '',text:row.body as string,kind:row.kind as 'text'|'attachment'|'system'})),total:count ?? 0,page,pageSize };
  }
  async statistics(user: AuthUser, id: string, filter: ChatFilter): Promise<Statistics> {
    const { data,error }=await this.supabase.forUser(user.token).rpc('conversation_statistics',{
      p_id:id,p_from:filter.from ?? null,p_to:filter.to ?? null,p_participant:filter.participantId ?? null });
    if (error || !data) return unavailable();
    return data as Statistics;
  }
}
