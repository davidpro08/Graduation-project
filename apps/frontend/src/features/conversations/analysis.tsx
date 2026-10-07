'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authenticatedRequest } from '@/lib/api';
import { conversationHref } from '@/lib/navigation';
import { Card, Empty, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from './filters';
import { TimePicker } from './time-picker';
interface Item {summary?:string;title?:string;dateTimeText?:string;evidenceMessageIds:string[]}
interface Job {id:string;status:'pending'|'processing'|'completed'|'failed';errorCode:string|null;result:{items:Item[]}|null;metadata:{warnings?:string[];jevUsed?:boolean;skippedChunks?:number}}
interface Schedule {id:string;title:string;dateTimeText:string;evidenceMessageIds:string[];status:'proposed'|'confirmed';startsAt:string|null;endsAt:string|null;suggestion?:{date:string|null;time:string|null;endTime:string|null;referenceDate:string;referenceTime:string;warnings:string[]}}
function failureMessage(code:string|null){
  switch(code){
    case 'ANALYSIS_TOO_LARGE':return '이전 분석의 대화 분량 제한에 걸렸습니다. 다시 분석해 주세요.';
    case 'ANALYSIS_TIMEOUT':return '분석 시간이 제한을 초과했습니다. 긴 대화는 시간이 오래 걸릴 수 있습니다.';
    case 'JOB_INTERRUPTED':return '백엔드가 재시작되어 분석이 중단됐습니다. 다시 분석해 주세요.';
    case 'AI_UNAVAILABLE':return '학교 AI 서버에 연결하지 못했습니다. 서버와 SSH 터널을 확인한 뒤 다시 분석해 주세요.';
    case 'AI_AUTH_ERROR':return 'AI 서버 인증 설정을 확인한 뒤 다시 분석해 주세요.';
    default:return '분석을 완료하지 못했습니다. 다시 시도해 주세요.';
  }
}
function Evidence({id,ids}:{id:string;ids:string[]}){return <div>{ids.map((message,index)=><Button key={message} variant="link" asChild><Link href={conversationHref(id,'messages',message)}>근거 {index+1} 원문</Link></Button>)}</div>;}
function ScheduleForm({schedule,onSaved,id}:{schedule:Schedule;onSaved:()=>void;id:string}){
  const local=schedule.startsAt?new Date(new Date(schedule.startsAt).getTime()+9*3600000).toISOString():'';
  const localEnd=schedule.endsAt?new Date(new Date(schedule.endsAt).getTime()+9*3600000).toISOString():'';
  const proposed=schedule.status==='proposed';
  const [title,setTitle]=useState(schedule.title),[date,setDate]=useState(local.slice(0,10)||(proposed?schedule.suggestion?.date:null)||''),[time,setTime]=useState(local.slice(11,16)||(proposed?schedule.suggestion?.time:null)||'');
  const [endTime,setEndTime]=useState(localEnd.slice(11,16)||(proposed?schedule.suggestion?.endTime:null)||'');
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  return <form className="stack" onSubmit={async event=>{event.preventDefault();if(!date||!time){setError('날짜와 시작 시간을 선택해 주세요.');return;}if(endTime&&endTime<=time){setError('종료 시간은 시작 시간 이후로 선택해 주세요.');return;}setBusy(true);setError('');try{await authenticatedRequest(`/schedules/${schedule.id}${schedule.status==='proposed'?'/confirm':''}`,{method:schedule.status==='proposed'?'POST':'PATCH',json:{title,date,time,...(endTime?{endTime}:{})}});onSaved();}catch(error){setError(error instanceof Error?error.message:'저장하지 못했습니다.');}finally{setBusy(false);}}}>
    <p>{schedule.status==='confirmed'?'확정 일정':'일정 후보'} · 원문: {schedule.dateTimeText}</p>
    {schedule.suggestion&&<p className="small muted">대화가 나온 시점: {schedule.suggestion.referenceDate} {schedule.suggestion.referenceTime} · 한국 시간</p>}
    <p aria-live="polite"><strong>{date||'날짜 미정'} · {time||'시간 미정'}{endTime?` ~ ${endTime}`:''}</strong>{proposed?' · 제안값, 확인 후 확정':''}</p>
    {proposed&&schedule.suggestion?.warnings.map(warning=><Notice key={warning}>{warning}</Notice>)}
    <label>제목<Input required maxLength={200} value={title} onInput={event=>setTitle(event.currentTarget.value)} onChange={event=>setTitle(event.target.value)}/></label>
    <DatePicker label="일정 날짜" value={date} onChange={setDate} placeholder="날짜 선택"/>
    <TimePicker label="시작 시간" value={time} onChange={setTime}/>
    <TimePicker label="종료 시간" value={endTime} onChange={setEndTime} optional/>
    <Evidence id={id} ids={schedule.evidenceMessageIds}/>{error&&<Notice tone="error">{error}</Notice>}
    <Button disabled={busy}>{busy?'저장 중…':schedule.status==='proposed'?'날짜·시간 확인 후 확정':'변경 저장'}</Button>
  </form>;
}
export function AnalysisPage({id,type}:{id:string;type:'contradiction'|'schedule'}){
  const [job,setJob]=useState<Job|null>(null),[schedules,setSchedules]=useState<Schedule[]>([]);
  const [useJev,setUseJev]=useState(true),[loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    async function load(){try{
      const {job:next}=await authenticatedRequest<{job:Job|null}>(`/conversations/${id}/analyses?type=${type}`,{signal:controller.signal});
      if(controller.signal.aborted)return;setJob(next);
      if(type==='schedule'){const saved=await authenticatedRequest<Schedule[]>(`/conversations/${id}/schedules`,{signal:controller.signal});if(!controller.signal.aborted)setSchedules(saved);}
      if(next && ['pending','processing'].includes(next.status))timer=setTimeout(()=>void load(),2000);
      setError('');
    }catch(error){if(!controller.signal.aborted)setError(error instanceof Error?error.message:'분석 상태를 조회하지 못했습니다.');}finally{if(!controller.signal.aborted)setLoading(false);}}
    void load();return()=>{controller.abort();if(timer)clearTimeout(timer);};
  },[id,type,revision]);
  const running=job && ['pending','processing'].includes(job.status);
  return <Card title={type==='contradiction'?'모순 후보':'일정 후보·확정 일정'}>
    <Notice>AI 결과는 후보입니다. 원문을 확인해 판단하세요. 분석을 시작하면 대화 내용이 JEV와 학교 AI 서버에 전달됩니다.</Notice>
    <label><input type="checkbox" checked={useJev} disabled={!!running||sending} onChange={event=>setUseJev(event.target.checked)}/> JEV로 후보 여부 먼저 판단</label>
    <Button disabled={loading||sending||!!running} onClick={async()=>{setSending(true);setError('');try{const next=await authenticatedRequest<Job>(`/conversations/${id}/analyses`,{method:'POST',json:{type,useJev}});setJob(next);setRevision(value=>value+1);}catch(error){setError(error instanceof Error?error.message:'분석을 시작하지 못했습니다.');}finally{setSending(false);}}}>{running?'분석 중…':sending?'시작 중…':job?'다시 분석':'분석 시작'}</Button>
    {loading&&<p role="status">저장된 분석을 불러오는 중…</p>}{running&&<p role="status">후보를 판단하고 상세 내용을 분석하고 있습니다.</p>}
    {error&&<><Notice tone="error">{error}</Notice><Button variant="outline" onClick={()=>setRevision(value=>value+1)}>다시 조회</Button></>}
    {job?.status==='failed'&&<Notice tone="error">{failureMessage(job.errorCode)}</Notice>}
    {job?.metadata.warnings?.map(warning=><Notice key={warning}>{warning}</Notice>)}
    {job?.status==='completed'&&<p className="small muted">{job.metadata.jevUsed?'JEV 사전 판단 사용':'Qwen 직접 분석'} · 후보 없음으로 생략한 구간 {job.metadata.skippedChunks??0}개</p>}
    {type==='contradiction'&&job?.result?.items.map((item,index)=><section key={index} className="stack"><p>{item.summary}</p><Evidence id={id} ids={item.evidenceMessageIds}/></section>)}
    {type==='schedule'&&schedules.map(schedule=><ScheduleForm key={`${schedule.id}-${schedule.startsAt}-${schedule.endsAt}-${schedule.suggestion?.date}-${schedule.suggestion?.time}`} schedule={schedule} id={id} onSaved={()=>setRevision(value=>value+1)}/>)}
    {job?.status==='completed'&&(type==='schedule'?schedules.length===0:job.result?.items.length===0)&&<Empty title="발견한 후보가 없습니다">AI가 놓친 내용이 있을 수 있으므로 필요한 내용은 원문에서도 확인해 주세요.</Empty>}
  </Card>;
}
