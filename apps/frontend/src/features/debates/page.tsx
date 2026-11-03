'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileText, History } from 'lucide-react';
import { Card, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { AiProgress } from '@/components/ai-progress';
import { useAuth } from '@/features/auth/provider';
import { useQueryResult } from '@/features/conversations/hooks';
import type { Conversation, Message } from '@/features/conversations/types';
import { authenticatedRequest } from '@/lib/api';
import { debateHref } from '@/lib/navigation';
import { PersonaFilterPanel } from './filters';
import { MessagePicker } from './message-picker';
import { type FacetResponse, type Preview, type Filters, type Job } from './types';

function DebateWorkspace({ conversation }: { conversation: Conversation }) {
  const id = conversation.id, router = useRouter();
  const [input, setInput] = useState(''), [filters, setFilters] = useState<Filters>({}), [messages,setMessages]=useState<Message[]>([]);
  const [sending, setSending] = useState(false), [error, setError] = useState('');
  const options = useQueryResult('facets:' + id, signal => authenticatedRequest<FacetResponse>('/conversations/' + id + '/personas/facets', { signal }));
  const preview = useQueryResult(JSON.stringify(['preview', id, filters]), signal => authenticatedRequest<Preview>('/conversations/' + id + '/personas/preview', { method: 'POST', json: { filters }, signal }), !!options.data && !options.error);
  return <div className="debate-composer stack">
    <div className="debate-intro"><div><p className="eyebrow">새로운 관점으로 살펴보기</p><h2>어떤 쟁점을 함께 생각해 볼까요?</h2><p className="muted">대화의 맥락을 정리하고, 다양한 사람들의 관점을 비교해 보세요.</p></div><Button asChild variant="outline"><Link href={debateHref(id, 'history')}><History size={16}/>분석 기록</Link></Button></div>
    <div className="debate-compose-layout">
      <div className="stack debate-input-column">
        <MessagePicker conversation={conversation} value={messages} onChange={setMessages} disabled={sending}/>
        <Card><form className="stack" onSubmit={async event => {
          event.preventDefault(); if (!input.trim() || sending) return;
          setSending(true); setError('');
          try { const job = await authenticatedRequest<Job>('/conversations/' + id + '/persona-debates', { method: 'POST', json: { input: input.trim(), filters, messageIds:messages.map(m=>m.id) } }); router.push(debateHref(id, job.id)); }
          catch (cause) { setError(cause instanceof Error ? cause.message : '문서를 만들지 못했습니다.'); setSending(false); }
        }}>
          <label htmlFor="debate-input" className="composer-label"><FileText size={18}/>살펴보고 싶은 논쟁</label>
          <textarea id="debate-input" className="debate-input composer-input" rows={9} required maxLength={800} value={input} disabled={sending} placeholder="예: 약속에 늦으면 벌금을 내기로 했는데, 불가피한 사정에도 예외 없이 적용해야 할까?" onChange={event => setInput(event.target.value)}/>
          <p className="small muted composer-character-count">{input.length} / 800</p>
          {error && <Notice tone="error">{error}</Notice>}
          {sending&&<AiProgress active title="대화 요약 준비 중" description="요약 작업을 접수하고 있습니다. 다음 화면에서 대화를 정리하는 진행 상태를 확인할 수 있습니다."/>}
          <div className="composer-submit"><p className="small muted">먼저 선택 대화와 외부 조사로 판단 문서를 만듭니다(최대3분).<br/>자료·조건을 보완하고 최종 문서를 확정한 뒤 의견을 요청합니다.</p><Button type="submit" disabled={sending || !input.trim()}>{sending ? '요약 문서 준비 중…' : '자료 조사·판단 문서 만들기'}<ArrowRight size={16}/></Button></div>
        </form></Card>
        <p className="small muted">직접 선택한 최대20개 발언만 문서 작성에 참고합니다. 의견 모델에는 원문 대신 확인한 문서만 전달합니다. 생성된 페르소나 의견은 실제 여론조사가 아닙니다.</p>
      </div>
      <aside className="card debate-audience-sidebar stack" aria-label="분석 대상 설정">
        {options.data && !options.error ? <PersonaFilterPanel options={options.data.values} conversationId={id} value={filters} onChange={setFilters} disabled={sending}/> : <section className="stack"><h2>분석 대상</h2>{options.loading && <p className="small muted" role="status">분석 대상 조건을 불러오고 있습니다…</p>}{options.error && <><Notice tone="warning">{options.error} 대상 설정을 불러오지 못해도 쟁점 문서는 작성할 수 있습니다.</Notice><Button type="button" variant="outline" onClick={options.retry}>조건 다시 불러오기</Button></>}</section>}
        <div className="sidebar-audience-preview" aria-live="polite">
          {preview.loading ? <p className="small muted">조건에 맞는 표본 확인 중…</p> : preview.data && !preview.error && <><div className="composer-audience"><span>조건에 맞는 <strong>{preview.data.eligible.toLocaleString()}명</strong> 중 {preview.data.selected}명 분석</span><span className="small muted">상세 {preview.data.detail}명 · 간단 의견 {preview.data.jev}명</span></div>{preview.data.warnings.map(warning => <Notice key={warning} tone="warning">{warning}</Notice>)}{!preview.data.eligible && <Notice tone="warning">선택한 조건에 맞는 페르소나가 없습니다. 조건을 줄여 주세요.</Notice>}</>}
          {preview.error && <Notice tone="warning">{preview.error}</Notice>}
        </div>
      </aside>
    </div>
  </div>;
}
export function PersonaDebatePage({ conversation }: { conversation: Conversation }) {
  const auth = useAuth(); return <DebateWorkspace key={auth.userId + ':' + conversation.id} conversation={conversation}/>;
}
