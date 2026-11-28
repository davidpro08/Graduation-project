import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Empty, Notice } from '@/components/layout';
import { getMessages } from '@/features/conversations/client';
import { PageControls, ParticipantAvatar, QueryFilters } from '@/features/conversations/filters';
import { useQueryResult } from '@/features/conversations/hooks';
import { formatDate, type ChatFilter, type Conversation } from '@/features/conversations/types';
import { AnalysisPage } from '@/features/conversations/analysis';
import { PersonaDebatePage } from '@/features/debates/page';
import '@/styles/messages.css';

export function MessagesPage({conversation,messageId}:{conversation:Conversation;messageId?:string}) {
  const [filter,setFilter]=useState<ChatFilter>(messageId?{messageId}:{page:1});const key=JSON.stringify([conversation.id,filter]);
  const {data,loading,error,retry}=useQueryResult(key,signal=>getMessages(conversation.id,filter,signal));
  useEffect(()=>{if(data && messageId && filter.messageId){const element=document.getElementById(`message-${messageId}`);element?.scrollIntoView({block:'center'});element?.focus({preventScroll:true});}},[data,messageId,filter.messageId]);
  return <div className="msg-page">
    <section className="msg-tools" aria-label="원문 탐색">
      <div className="msg-tools-head"><label className="msg-search"><span className="sr-only">메시지 검색</span><Input type="search" placeholder="메시지 내용을 검색하세요" maxLength={200} value={filter.search ?? ''} onChange={event=>setFilter({...filter,messageId:undefined,search:event.target.value,page:1})}/></label><span className="msg-count">{conversation.messageCount.toLocaleString()}개 보관</span></div>
      <QueryFilters filter={filter} onChange={value=>setFilter({...value,messageId:undefined})} participants={conversation.participants} startDate={conversation.startDate} endDate={conversation.endDate}/>
      {conversation.warnings.length>0 && <details className="parser-notes"><summary>가져오기 안내</summary>{conversation.warnings.map((warning,index)=><p key={index} className="small muted">{warning}</p>)}</details>}
    </section>
    {loading && <p className="small muted" role="status">메시지 조회 중…</p>}{error && <><Notice tone="error">{error}</Notice><Button variant="outline" onClick={retry}>다시 조회</Button></>}
    {!data && loading?<Skeleton className="h-64 w-full"/>:data && !error?<div className={`msg-list ${loading?'is-refreshing':''}`} aria-busy={loading}>{data.items.map((message,index)=><div key={message.id} className="msg-row">
      {(index===0 || data.items[index-1].date!==message.date) && <p className="msg-date">{formatDate(message.date)}</p>}
      {message.kind==='system'?<p className="msg-system">{message.time} {message.text}</p>:<article tabIndex={-1} id={`message-${message.id}`} className={`msg-item ${message.id===messageId?'highlighted':''}`}>
        <ParticipantAvatar participant={conversation.participants.find(p=>p.id===message.participantId)!}/><div className="msg-body"><div className="msg-meta"><strong>{message.speaker}</strong><time dateTime={`${message.date}T${message.time}:00+09:00`}>{message.time}</time>{message.kind==='attachment' && <Badge variant="outline">첨부 표시</Badge>}</div><p className="msg-bubble">{message.text}</p></div></article>}
    </div>)}{!data.items.length && <Empty title="일치하는 메시지가 없습니다">검색어와 참여자, 기간을 확인해 주세요.</Empty>}</div>:null}
    {data && !error && <PageControls page={data.page} total={data.total} pageSize={data.pageSize} disabled={loading} onChange={page=>{setFilter({...filter,messageId:undefined,page});window.scrollTo({top:0,behavior:'smooth'});}}/>}
  </div>;
}
export function ContradictionPage({conversation}:{conversation:Conversation}){return <AnalysisPage id={conversation.id} type="contradiction" endDate={conversation.endDate}/>;}
export function OpinionsPage({conversation}:{conversation:Conversation}){return <PersonaDebatePage conversation={conversation}/>;}
export function SchedulesPage({conversation}:{conversation:Conversation}){return <AnalysisPage id={conversation.id} type="schedule" endDate={conversation.endDate}/>;}
