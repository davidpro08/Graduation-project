import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { FileText, UploadCloud } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog';
import { Card, Empty, Notice } from '@/components/layout';
import { getHealth } from '@/lib/api';
import { conversationHref } from '@/lib/navigation';
import { useConversationStore } from '@/features/conversations/provider';
import { formatDate, type Conversation } from '@/features/conversations/types';
import { PageControls, ParticipantAvatar } from '@/features/conversations/filters';
export { LoginPage } from '@/features/auth/login-page';

export function ConversationList() {
  const store=useConversationStore();const [deleting,setDeleting]=useState<Conversation>();const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function remove(){if(!deleting)return;setBusy(true);setError('');try{await store.deleteConversation(deleting.id);setDeleting(undefined);if(store.conversations.length===1 && store.page>1)store.setPage(store.page-1);}catch(cause){setError(cause instanceof Error?cause.message:'삭제하지 못했습니다.');}finally{setBusy(false);}}
  return <><Card title="보관한 대화" action={<Badge variant="secondary">총 {store.total.toLocaleString()}개</Badge>}>
    <label>대화 검색<Input type="search" maxLength={200} value={store.search} onChange={event=>store.setSearch(event.target.value)} placeholder="대화 제목으로 검색하세요"/></label>
    {store.loading?<div className="stack" aria-label="대화 목록 로딩"><Skeleton className="h-24 w-full"/><Skeleton className="h-24 w-full"/></div>:
      store.error?<><Notice tone="error">{store.error}</Notice><Button variant="outline" onClick={store.reload}>다시 조회</Button></>:
      store.conversations.length?<div className="conversation-list">{store.conversations.map(item=><article key={item.id} className="conversation-row"><div className="conversation-summary"><h3>{item.title}</h3>
        <p className="small muted">{formatDate(item.startDate)} – {formatDate(item.endDate)} · 메시지 {item.messageCount.toLocaleString()}개 · {item.participants.length}명</p>
        <div className="participant-preview">{item.participants.slice(0,6).map(p=><ParticipantAvatar key={p.id} participant={p}/>)}{item.participants.length>6 && <span className="small muted">+{item.participants.length-6}</span>}</div>
      </div><div className="actions"><Button asChild><Link href={conversationHref(item.id)}>대화 열기</Link></Button><Button variant="danger-outline" onClick={()=>{setError('');setDeleting(item);}}>삭제</Button></div></article>)}</div>:
      <Empty title="보관한 대화가 없습니다">카카오톡에서 내보낸 TXT 파일을 업로드해 주세요.</Empty>}
    {!store.loading && !store.error && store.total>20 && <PageControls page={store.page} total={store.total} pageSize={20} onChange={store.setPage}/>}
  </Card><Card title="대화 보관 안내"><p>원본 TXT는 비공개로 보관하며 대화 원문과 통계는 저장한 메시지를 기준으로 표시합니다.</p><p className="muted">대화를 삭제하면 원본 파일과 참여자·메시지도 함께 삭제됩니다.</p></Card>
  <AlertDialog open={!!deleting} onOpenChange={open=>{if(!open && !busy)setDeleting(undefined);}}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>이 대화를 삭제할까요?</AlertDialogTitle><AlertDialogDescription>{deleting?.title}의 원본 파일과 모든 메시지가 삭제됩니다.</AlertDialogDescription></AlertDialogHeader>
    {error && <Notice tone="error">{error}</Notice>}<AlertDialogFooter><AlertDialogCancel disabled={busy}>취소</AlertDialogCancel><Button variant="destructive" disabled={busy} onClick={remove}>{busy?'삭제 중…':'삭제'}</Button></AlertDialogFooter></AlertDialogContent></AlertDialog></>;
}
export function UploadPage({onAdd}:{onAdd:(title:string,file:File,uploadId:string)=>Promise<string>}) {
  const router=useRouter();const [title,setTitle]=useState('');const [file,setFile]=useState<File>();const [preview,setPreview]=useState('');
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [reading,setReading]=useState(false);const uploadId=useRef('');const readVersion=useRef(0);
  async function readFile(event:ChangeEvent<HTMLInputElement>){
    const selected=event.target.files?.[0];const version=++readVersion.current;setFile(undefined);setPreview('');setError('');setReading(false);uploadId.current=crypto.randomUUID();
    if(!selected)return;
    if(!selected.name.toLowerCase().endsWith('.txt') || !selected.size || selected.size>10485760){setError('비어 있지 않은 10MB 이하 TXT 파일을 선택해 주세요.');return;}
    setReading(true);
    try {
      const buffer=await selected.slice(0,16384).arrayBuffer();const bytes=new Uint8Array(buffer);
      let content:string;
      if(bytes[0]===0xff && bytes[1]===0xfe)content=new TextDecoder('utf-16le').decode(buffer);
      else if(bytes[0]===0xfe && bytes[1]===0xff)content=new TextDecoder('utf-16be').decode(buffer);
      else{try{content=new TextDecoder('utf-8',{fatal:true}).decode(buffer,{stream:true});}catch{content=new TextDecoder('euc-kr').decode(buffer);}}
      if(version!==readVersion.current)return;
      setFile(selected);setPreview(content.slice(0,4000));setTitle(selected.name.replace(/\.txt$/i,'').slice(0,80));
    }catch{if(version===readVersion.current)setError('파일을 읽지 못했습니다. 다른 파일을 선택해 주세요.');}
    finally{if(version===readVersion.current)setReading(false);}
  }
  async function submit(event:FormEvent){event.preventDefault();if(!file || busy)return;setBusy(true);setError('');try{const id=await onAdd(title.trim(),file,uploadId.current);router.push(conversationHref(id));}catch(cause){setError(cause instanceof Error?cause.message:'대화를 저장하지 못했습니다.');}finally{setBusy(false);}}
  return <><Notice>카카오톡 PC·모바일에서 내보낸 TXT 파일을 지원합니다. 파일에서 메시지를 추출해 원문과 통계를 제공합니다.</Notice>
  <form onSubmit={submit} className="stack"><Card title="1. 대화 파일 선택"><label className="upload-box"><UploadCloud size={32} aria-hidden="true"/><span>카카오톡 TXT 파일 선택</span><Input type="file" accept=".txt,text/plain" onChange={readFile} disabled={busy}/></label>
    <p className="small muted">최대 10MB · 메시지 100,000개 · 참여자 400명 · UTF-8 / UTF-16 / CP949 지원</p></Card>
    <Card title="2. 원문 미리보기">{reading?<Skeleton className="h-40 w-full"/>:file?<><div className="file-meta"><FileText size={18}/><strong>{file.name}</strong><Badge variant="secondary">{(file.size/1024).toFixed(1)} KB</Badge></div><pre className="file-preview">{preview}</pre><p className="small muted">원문 앞부분 최대 4,000자입니다. 저장 시 서버가 전체 파일을 파싱합니다.</p></>:<Empty title="선택한 파일이 없습니다">카카오톡 대화방에서 대화 내용을 TXT로 내보낸 뒤 선택하세요.</Empty>}</Card>
    <Card title="3. 대화 정보"><label>대화 제목<Input value={title} onChange={event=>setTitle(event.target.value)} required maxLength={80} placeholder="대화 제목" disabled={busy}/></label>
      {error && <Notice tone="error">{error}</Notice>}{busy && <Notice>원본 파일을 업로드하고 메시지를 저장하고 있습니다. 잠시 기다려 주세요.</Notice>}
      <div className="actions"><Button type="submit" disabled={!file || !title.trim() || busy || reading}>{busy?'파싱·저장 중…':'대화 저장'}</Button><Button asChild variant="outline"><Link href="/conversations">내 대화로 돌아가기</Link></Button></div>
      <p className="small muted">원본은 비공개로 보관합니다. 저장 후 모순 후보와 일정을 분석할 수 있습니다. 관점별 의견은 준비 중입니다.</p></Card></form></>;
}
export function HealthPage() {
  const [connection,setConnection]=useState<'loading'|'connected'|'failed'>('loading');const [attempt,setAttempt]=useState(0);
  useEffect(()=>{const controller=new AbortController();getHealth(controller.signal).then(()=>{if(!controller.signal.aborted)setConnection('connected');}).catch(()=>{if(!controller.signal.aborted)setConnection('failed');});return ()=>controller.abort();},[attempt]);
  return <Card title="개발 환경 연결 상태"><Notice tone={connection==='failed'?'error':connection==='connected'?'success':'info'}>{({loading:'백엔드 연결 확인 중',connected:'백엔드 연결 정상',failed:'백엔드 연결 실패'})[connection]}</Notice><div className="actions"><Button disabled={connection==='loading'} onClick={()=>{setConnection('loading');setAttempt(value=>value+1);}}>다시 확인</Button><Button asChild variant="outline"><Link href="/api/docs" target="_blank" rel="noreferrer">API 문서 열기</Link></Button></div></Card>;
}
