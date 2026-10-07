import type { AuthUser } from '../auth/auth.types';
import type { ChatMessage } from '../conversations/conversation.types';
import type { TimeSuggestion } from './schedule-time';
export type AnalysisType = 'contradiction' | 'schedule';
export interface AnalysisItem { summary?: string; title?: string; dateTimeText?: string; evidenceMessageIds: string[] }
export interface AnalysisJob {
  id: string; conversationId: string; analysisType: AnalysisType;
  status: 'pending'|'processing'|'completed'|'failed'; errorCode: string|null;
  createdAt: string; updatedAt: string; result: {items:AnalysisItem[]}|null; metadata: Record<string,unknown>;
}
export interface Schedule {
  id:string; conversationId:string; jobId:string; title:string; dateTimeText:string;
  evidenceMessageIds:string[]; status:'proposed'|'confirmed'; startsAt:string|null; endsAt:string|null; suggestion?:TimeSuggestion;
}
export interface ScheduleInput {title:string; date:string; time:string; endTime?:string}
export const ANALYSIS_REPO=Symbol('ANALYSIS_REPO');
export interface AnalysisRepo {
  create(user:AuthUser,id:string,conversationId:string,type:AnalysisType):Promise<AnalysisJob>;
  find(user:AuthUser,id:string):Promise<AnalysisJob>;
  latest(user:AuthUser,conversationId:string,type:AnalysisType):Promise<AnalysisJob|null>;
  state(user:AuthUser,id:string,status:'processing'|'failed',errorCode?:string):Promise<void>;
  complete(user:AuthUser,id:string,items:AnalysisItem[],metadata:Record<string,unknown>):Promise<void>;
  schedules(user:AuthUser,conversationId:string):Promise<Schedule[]>;
  saveSchedule(user:AuthUser,id:string,input:ScheduleInput,confirm:boolean):Promise<Schedule>;
}
export const DETAIL_AI=Symbol('DETAIL_AI');
export interface DetailAi {
  count(type:AnalysisType,messages:ChatMessage[],signal:AbortSignal):Promise<{count:number;limit:number}>;
  analyze(type:AnalysisType,messages:ChatMessage[],signal:AbortSignal):Promise<{items:AnalysisItem[];model:string}>;
}
export class AnalysisError extends Error {constructor(readonly code:string){super(code);}}
