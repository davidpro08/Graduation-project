'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, authenticatedRequest } from '@/lib/api';
import { conversationHref } from '@/lib/navigation';
import { Card, Empty, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from './filters';
import { TimePicker } from './time-picker';
import { AiProgress } from '@/components/ai-progress';
interface Item {summary?:string;title?:string;dateTimeText?:string;evidenceMessageIds:string[]}
interface Job {id:string;status:'pending'|'processing'|'completed'|'failed';errorCode:string|null;result:{items:Item[]}|null;metadata:{warnings?:string[];coverage?:'complete'|'partial';failedChunks?:number;failures?:{fromDate:string;fromTime:string;toDate:string;toTime:string;errorCode:string}[];inputRange?:{from:string;to:string;anchor:'conversation_end';messageCount:number}}}
interface Schedule {id:string;title:string;dateTimeText:string;evidenceMessageIds:string[];status:'proposed'|'confirmed';startsAt:string|null;endsAt:string|null;suggestion?:{date:string|null;time:string|null;endTime:string|null;referenceDate:string;referenceTime:string;warnings:string[];uncertain?:boolean}}
function failureMessage(code:string|null){
  switch(code){
    case 'ANALYSIS_TOO_LARGE':return '이전 분석의 대화 분량 제한에 걸렸습니다. 다시 분석해 주세요.';
    case 'ANALYSIS_TIMEOUT':return '분석 시간이 제한을 초과했습니다. 긴 대화는 시간이 오래 걸릴 수 있습니다.';
    case 'JOB_INTERRUPTED':return '백엔드가 재시작되어 분석이 중단됐습니다. 다시 분석해 주세요.';
    case 'AI_UNAVAILABLE':return '학교 AI 서버에 연결하지 못했습니다. 서버와 SSH 터널을 확인한 뒤 다시 분석해 주세요.';
    case 'AI_REQUEST_TIMEOUT':return '학교 AI 서버의 응답 대기 시간이 초과됐습니다. 잠시 후 다시 분석해 주세요.';
    case 'AI_BUSY':return '학교 AI 서버에 요청이 몰려 있습니다. 잠시 후 다시 분석해 주세요.';
    case 'AI_AUTH_ERROR':return 'AI 서버 인증 설정을 확인한 뒤 다시 분석해 주세요.';
    case 'AI_INVALID_EVIDENCE':return 'AI가 반환한 근거가 입력 메시지와 일치하지 않습니다. 다시 분석해 주세요.';
    case 'AI_INVALID_RESPONSE':return 'AI 응답이 필요한 형식과 일치하지 않습니다. 다시 분석해 주세요.';
    case 'AI_INCOMPLETE_RESPONSE':return 'AI 응답이 끝까지 생성되지 않았습니다. 다시 분석해 주세요.';
    default:return '분석을 완료하지 못했습니다. 다시 시도해 주세요.';
  }
}
function Evidence({id,ids}:{id:string;ids:string[]}){return <div className="analysis-evidence">{ids.map((message,index)=><Button key={message} variant="outline" asChild><Link href={conversationHref(id,'messages',message)}>근거 {index+1} 원문 ↗</Link></Button>)}</div>;}
function ScheduleForm({schedule,onSaved,id}:{schedule:Schedule;onSaved:()=>void;id:string}){
  const local=schedule.startsAt?new Date(new Date(schedule.startsAt).getTime()+9*3600000).toISOString():'';
  const localEnd=schedule.endsAt?new Date(new Date(schedule.endsAt).getTime()+9*3600000).toISOString():'';
  const proposed=schedule.status==='proposed';
  const uncertain=proposed&&!!(schedule.suggestion?.uncertain||schedule.suggestion?.warnings.length);
  const [title,setTitle]=useState(schedule.title),[date,setDate]=useState(local.slice(0,10)||(proposed?schedule.suggestion?.date:null)||''),[time,setTime]=useState(local.slice(11,16)||(proposed?schedule.suggestion?.time:null)||'');
  const [endTime,setEndTime]=useState(localEnd.slice(11,16)||(proposed?schedule.suggestion?.endTime:null)||'');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <form className={`stack schedule-candidate${uncertain?' is-uncertain':''}`} onSubmit={async event=>{event.preventDefault();if(!date||!time){setError('날짜와 시작 시간을 선택해 주세요.');return;}if(endTime&&endTime<=time){setError('종료 시간은 시작 시간 이후로 선택해 주세요.');return;}setBusy(true);setError('');try{await authenticatedRequest(`/schedules/${schedule.id}${schedule.status==='proposed'?'/confirm':''}`,{method:schedule.status==='proposed'?'POST':'PATCH',json:{title,date,time,...(endTime?{endTime}:{})}});onSaved();}catch(error){setError(error instanceof Error?error.message:'저장하지 못했습니다.');}finally{setBusy(false);}}}>
    <div className="candidate-heading"><h3>{schedule.title}</h3><span className={`candidate-label${uncertain?' is-uncertain':''}`}>{uncertain?'불확실 · 확인 필요':proposed?'일정 후보':'확정 일정'}</span></div>
    <p className="small muted">원문: {schedule.dateTimeText}</p>
    {schedule.suggestion&&<p className="small muted">대화가 나온 시점: {schedule.suggestion.referenceDate} {schedule.suggestion.referenceTime} · 한국 시간</p>}
    <p className="candidate-datetime" aria-live="polite"><strong>{date||'날짜 미정'} · {time||'시간 미정'}{endTime?` ~ ${endTime}`:''}</strong>{proposed?' · 제안값, 확인 후 확정':''}</p>
    {proposed&&schedule.suggestion?.warnings.map(warning=><Notice tone={uncertain?'error':undefined} key={warning}>{warning}</Notice>)}
    <label>제목<Input required maxLength={200} value={title} onInput={event=>setTitle(event.currentTarget.value)} onChange={event=>setTitle(event.target.value)}/></label>
    <DatePicker label="일정 날짜" value={date} onChange={setDate} placeholder="날짜 선택"/>
    <TimePicker label="시작 시간" value={time} onChange={setTime}/>
    <TimePicker label="종료 시간" value={endTime} onChange={setEndTime} optional/>
    <Evidence id={id} ids={schedule.evidenceMessageIds}/>{error&&<Notice tone="error">{error}</Notice>}
    <Button disabled={busy}>{busy?'저장 중…':schedule.status==='proposed'?'날짜·시간 확인 후 확정':'변경 저장'}</Button>
  </form>;
}
export function AnalysisPage({id,type,endDate}:{id:string;type:'contradiction'|'schedule';endDate:string}){
  const [job,setJob]=useState<Job|null>(null),[schedules,setSchedules]=useState<Schedule[]>([]);
  const [loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;let readFailures=0;
    async function load(){try{
      const {job:next}=await authenticatedRequest<{job:Job|null}>(`/conversations/${id}/analyses?type=${type}`,{signal:controller.signal});
      if(controller.signal.aborted)return;setJob(next);
      if(type==='schedule'){const saved=await authenticatedRequest<Schedule[]>(`/conversations/${id}/schedules`,{signal:controller.signal});if(!controller.signal.aborted)setSchedules(saved);}
      if(next && ['pending','processing'].includes(next.status))timer=setTimeout(()=>void load(),2000);
      setError('');readFailures=0;
    }catch(error){if(!controller.signal.aborted){const retry=!(error instanceof ApiError&&[401,403,404].includes(error.status));setError(`${error instanceof Error?error.message:'분석 상태를 조회하지 못했습니다.'}${retry?' 상태 조회를 다시 시도하고 있습니다.':''}`);if(retry)timer=setTimeout(()=>void load(),Math.min(15000,2000*2**Math.min(readFailures++,3)));}}finally{if(!controller.signal.aborted)setLoading(false);}}
    void load();return()=>{controller.abort();if(timer)clearTimeout(timer);};
  },[id,type,revision]);
  const running=job && ['pending','processing'].includes(job.status);
  return <Card title={type==='contradiction'?'모순 후보':'일정 후보·확정 일정'}>
    <Notice>대화의 마지막 날짜({endDate})를 기준으로 최근 한 달의 텍스트만 학교 AI 서버에 보내 분석합니다. AI 결과는 후보이므로 원문을 확인해 판단하세요.</Notice>
    <Button disabled={loading||sending||!!running} onClick={async()=>{setSending(true);setError('');try{const next=await authenticatedRequest<Job>(`/conversations/${id}/analyses`,{method:'POST',json:{type}});setJob(next);setRevision(value=>value+1);}catch(error){setError(error instanceof Error?error.message:'분석을 시작하지 못했습니다.');}finally{setSending(false);}}}>{running?'분석 중…':sending?'시작 중…':job?'다시 분석':'분석 시작'}</Button>
    {loading&&<p role="status">저장된 분석을 불러오는 중…</p>}
    {(sending||running||job?.status==='completed')&&<AiProgress key={job?.id??'starting'} active={!!(sending||running)} done={job?.status==='completed'&&!sending}
      title={job?.status==='completed'&&!sending?(job.metadata.coverage==='partial'?'일부 구간 분석 완료':'분석 완료'):type==='contradiction'?'모순 후보 분석 중':'일정 후보 분석 중'}
      description={job?.status==='completed'&&!sending?'아래 결과와 근거를 확인해 주세요.':sending?'AI 분석 요청을 접수하고 있습니다.':'최근 한 달의 대화를 구간별로 읽고 후보·근거를 확인합니다. 오류가 있는 구간은 재시도하므로 대화량에 따라 시간이 걸릴 수 있습니다.'}/>}
    {error&&<><Notice tone="error">{error}</Notice><Button variant="outline" onClick={()=>setRevision(value=>value+1)}>다시 조회</Button></>}
    {job?.status==='failed'&&<Notice tone="error">{failureMessage(job.errorCode)}</Notice>}
    {job?.metadata.inputRange&&<p className="small muted">분석한 대화 기간: {job.metadata.inputRange.from} ~ {job.metadata.inputRange.to} · 텍스트 {job.metadata.inputRange.messageCount.toLocaleString()}개</p>}
    {job?.status==='completed'&&!job.metadata.inputRange&&<Notice>이전 기준으로 분석한 결과입니다. 다시 분석하면 최근 한 달만 분석합니다.</Notice>}
    {job?.metadata.warnings?.map(warning=><Notice key={warning}>{warning}</Notice>)}
    {job?.metadata.coverage==='partial'&&<Notice tone="error"><strong>일부 구간의 결과입니다.</strong> 분석하지 못한 구간에는 후보가 더 있을 수 있습니다. 다시 분석하면 전체 기간을 재검사합니다.</Notice>}
    {!!job?.metadata.failures?.length&&<details className="analysis-failures"><summary>분석하지 못한 구간 {job.metadata.failedChunks}개 확인</summary>{job.metadata.failures.map((failure,index)=><p className="small" key={index}>{failure.fromDate} {failure.fromTime} ~ {failure.toDate} {failure.toTime} · {failureMessage(failure.errorCode)}</p>)}</details>}
    {type==='contradiction'&&job?.result?.items.map((item,index)=><section key={index} className="contradiction-candidate"><div className="candidate-heading"><span className="candidate-number">{String(index+1).padStart(2,'0')}</span><h3>{item.title||item.summary?.split(/[.!?。\n]/)[0].slice(0,50)||'모순 가능성'}</h3></div><p className="candidate-body">{item.summary}</p><Evidence id={id} ids={item.evidenceMessageIds}/></section>)}
    {type==='schedule'&&schedules.map(schedule=><ScheduleForm key={`${schedule.id}-${schedule.startsAt}-${schedule.endsAt}-${schedule.suggestion?.date}-${schedule.suggestion?.time}`} schedule={schedule} id={id} onSaved={()=>setRevision(value=>value+1)}/>)}
    {job?.status==='completed'&&(type==='schedule'?schedules.length===0:job.result?.items.length===0)&&<Empty title="발견한 후보가 없습니다">AI가 놓친 내용이 있을 수 있으므로 필요한 내용은 원문에서도 확인해 주세요.</Empty>}
  </Card>;
}
