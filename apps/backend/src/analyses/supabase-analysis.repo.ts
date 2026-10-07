import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { SupabaseService } from '../supabase/supabase.service';
import type { AnalysisItem, AnalysisJob, AnalysisRepo, AnalysisType, Schedule, ScheduleInput } from './analysis.types';
import { hasDateExpression, suggestTime } from './schedule-time';
type JobRow={id:string;conversation_id:string;analysis_type:AnalysisType;status:AnalysisJob['status'];error_code:string|null;created_at:string;updated_at:string;result:AnalysisJob['result'];metadata:AnalysisJob['metadata']};
type ScheduleRow={id:string;conversation_id:string;job_id:string;title:string;date_time_text:string;evidence_message_ids:string[];status:Schedule['status'];starts_at:string|null;ends_at:string|null};
const job=(row:JobRow):AnalysisJob=>({id:row.id,conversationId:row.conversation_id,analysisType:row.analysis_type,status:row.status,errorCode:row.error_code,createdAt:row.created_at,updatedAt:row.updated_at,result:row.result,metadata:row.metadata});
const schedule=(row:ScheduleRow):Schedule=>({id:row.id,conversationId:row.conversation_id,jobId:row.job_id,title:row.title,dateTimeText:row.date_time_text,evidenceMessageIds:row.evidence_message_ids,status:row.status,startsAt:row.starts_at,endsAt:row.ends_at});
const unavailable=()=>new ServiceUnavailableException('분석 저장 서비스를 사용할 수 없습니다. 다시 시도해 주세요.');
@Injectable()
export class SupabaseAnalysisRepo implements AnalysisRepo {
  constructor(private readonly db:SupabaseService){}
  async create(user:AuthUser,id:string,conversationId:string,type:AnalysisType){
    const {data,error}=await this.db.forUser(user.token).from('analysis_jobs').insert({id,conversation_id:conversationId,owner_id:user.id,analysis_type:type}).select().single();
    if(error?.code==='23505')throw new ConflictException('이미 진행 중인 분석이 있습니다.');
    if(error||!data)throw unavailable();return job(data as JobRow);
  }
  async find(user:AuthUser,id:string){
    const {data,error}=await this.db.forUser(user.token).from('analysis_jobs').select('*').eq('owner_id',user.id).eq('id',id).maybeSingle();
    if(error)throw unavailable();if(!data)throw new NotFoundException('분석을 찾을 수 없습니다.');return job(data as JobRow);
  }
  async latest(user:AuthUser,conversationId:string,type:AnalysisType){
    const {data,error}=await this.db.forUser(user.token).from('analysis_jobs').select('*').eq('owner_id',user.id).eq('conversation_id',conversationId).eq('analysis_type',type).order('created_at',{ascending:false}).order('id').limit(1).maybeSingle();
    if(error)throw unavailable();return data?job(data as JobRow):null;
  }
  async state(user:AuthUser,id:string,status:'processing'|'failed',errorCode?:string){
    const {error}=await this.db.forUser(user.token).from('analysis_jobs').update({status,error_code:errorCode??null,updated_at:new Date().toISOString()}).eq('owner_id',user.id).eq('id',id).in('status',['pending','processing']);
    if(error)throw unavailable();
  }
  async complete(user:AuthUser,id:string,items:AnalysisItem[],metadata:Record<string,unknown>){
    const {error}=await this.db.forUser(user.token).rpc('complete_analysis',{p_id:id,p_items:items,p_metadata:metadata});if(error)throw unavailable();
  }
  async schedules(user:AuthUser,conversationId:string){
    const {data,error}=await this.db.forUser(user.token).from('schedules').select('*').eq('owner_id',user.id).eq('conversation_id',conversationId).order('created_at').limit(1000);
    if(error||!data)throw unavailable();
    const rows=data as ScheduleRow[];
    const ids=[...new Set(rows.flatMap(row=>row.evidence_message_ids))];
    type Reference={id:string;sequence:number;body:string;message_date:string;message_time:string|null};
    const references=new Map<string,Reference>();
    for(let offset=0;offset<ids.length;offset+=100){
      const response=await this.db.forUser(user.token).from('messages').select('id,sequence,body,message_date,message_time').eq('owner_id',user.id).eq('conversation_id',conversationId).in('id',ids.slice(offset,offset+100));
      if(response.error||!response.data)throw unavailable();
      for(const reference of response.data as Reference[])references.set(reference.id,reference);
    }
    return rows.map(row=>{
      const evidence=row.evidence_message_ids.map(id=>references.get(id)).filter((ref):ref is Reference=>!!ref).sort((a,b)=>a.sequence-b.sequence);
      const normalized=row.date_time_text.replace(/\s/g,'');
      const source=evidence.find(ref=>ref.body.replace(/\s/g,'').includes(normalized))??evidence.find(ref=>hasDateExpression(ref.body))??evidence[0];
      const expression=source?.body.replace(/\s/g,'').includes(normalized)?row.date_time_text:source?.body;
      return {...schedule(row),...(source&&expression?{suggestion:suggestTime(expression,source.message_date,source.message_time?.slice(0,5)??'00:00')}:{})};
    });
  }
  async saveSchedule(user:AuthUser,id:string,input:ScheduleInput,confirm:boolean){
    const {data,error}=await this.db.forUser(user.token).from('schedules').update({title:input.title.trim(),starts_at:`${input.date}T${input.time}:00+09:00`,ends_at:input.endTime?`${input.date}T${input.endTime}:00+09:00`:null,status:'confirmed',updated_at:new Date().toISOString()})
      .eq('owner_id',user.id).eq('id',id).in('status',confirm?['proposed','confirmed']:['confirmed']).select().maybeSingle();
    if(error)throw unavailable();if(!data)throw new NotFoundException('수정할 일정을 찾을 수 없습니다.');return schedule(data as ScheduleRow);
  }
}
