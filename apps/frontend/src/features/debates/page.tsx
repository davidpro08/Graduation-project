'use client';
import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Check, History } from 'lucide-react';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { AiProgress } from '@/components/ai-progress';
import { useAuth } from '@/features/auth/provider';
import { useQueryResult } from '@/features/conversations/hooks';
import type { Conversation, Message } from '@/features/conversations/types';
import { authenticatedRequest } from '@/lib/api';
import { debateHref } from '@/lib/navigation';
import { PersonaFilters } from './filters';
import { MessagePicker } from './message-picker';
import { advancedDimensions, basicDimensions, dimensionLabels, dimensions, optionLabel, type Dimension, type Facets, type FacetResponse, type Preview, type Filters, type Job } from './types';
import '@/styles/debate-wizard.css';

const steps = [
  { label: '쟁점', title: '어떤 쟁점을 살펴볼까요?', description: '대화에서 의견이 갈린 부분을 질문처럼 적어 주세요.' },
  { label: '참고 대화', title: '참고할 대화를 골라 주세요', description: '관련 발언을 최대 20개까지 담을 수 있어요. 담지 않고 넘어가면 질문만으로 문서를 만들어요.' },
  { label: '분석 대상', title: '누구의 관점으로 볼까요?', description: '바꾸고 싶은 조건만 눌러서 고치세요. 나머지는 전체로 둬요.' },
  { label: '확인', title: '이대로 시작할까요?', description: '내용을 확인하고 판단 문서를 만들어요.' },
] as const;

const summarize = (key: Dimension, filters: Filters) => {
  const selected = filters[key] ?? [];
  if (!selected.length) return '전체';
  const shown = selected.slice(0, 2).map(option => optionLabel(key, option)).join(', ');
  return selected.length > 2 ? `${shown} 외 ${selected.length - 2}` : shown;
};

function AudienceCards({ options, conversationId, value, onChange, disabled }: { options: Facets; conversationId: string; value: Filters; onChange: (filters: Filters) => void; disabled?: boolean }) {
  const [editing, setEditing] = useState<Dimension | null>(null);
  const [advanced, setAdvanced] = useState(() => advancedDimensions.some(key => value[key]?.length));
  const card = (key: Dimension) => <button type="button" key={key} className={`audience-card${editing === key ? ' is-open' : ''}${value[key]?.length ? ' is-set' : ''}`} aria-expanded={editing === key} disabled={disabled} onClick={() => setEditing(editing === key ? null : key)}>
    <span className="audience-card-head"><strong>{dimensionLabels[key]}</strong><span>{editing === key ? '접기 ▴' : '바꾸기 ›'}</span></span>
    <span className="audience-card-value">{summarize(key, value)}</span>
  </button>;
  return <div className="audience-step">
    <p className="audience-group-label">기본 조건</p>
    <div className="audience-card-grid">{basicDimensions.map(card)}</div>
    <button type="button" className="audience-advanced-toggle" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}>{advanced ? '▾' : '▸'} 고급 조건 <span>직업 · 시군구 · 학사 전공 · 주택 · 현역 여부</span></button>
    {advanced && <div className="audience-card-grid">{advancedDimensions.map(card)}</div>}
    {editing && <div className="audience-editor">
      <div className="audience-editor-head"><strong>{dimensionLabels[editing]} 고르기</strong><Button type="button" size="sm" variant="secondary" onClick={() => setEditing(null)}>완료</Button></div>
      <PersonaFilters key={editing} only={editing} options={options} conversationId={conversationId} value={value} onChange={onChange} disabled={disabled}/>
    </div>}
    <p className="small muted">전체는 조건 제한이 없는 상태예요. 다른 항목을 누르면 전체가 해제돼요. 항목 안에서는 하나 이상 일치 · 항목끼리는 모두 일치 · 항목당 최대 30개</p>
  </div>;
}

function DebateWorkspace({ conversation }: { conversation: Conversation }) {
  const id = conversation.id, router = useRouter();
  const [input, setInput] = useState(''), [filters, setFilters] = useState<Filters>({}), [messages,setMessages]=useState<Message[]>([]);
  const [sending, setSending] = useState(false), [error, setError] = useState(''), [step, setStep] = useState(0);
  const options = useQueryResult('facets:' + id, signal => authenticatedRequest<FacetResponse>('/conversations/' + id + '/personas/facets', { signal }));
  const preview = useQueryResult(JSON.stringify(['preview', id, filters]), signal => authenticatedRequest<Preview>('/conversations/' + id + '/personas/preview', { method: 'POST', json: { filters }, signal }), !!options.data && !options.error);
  const ready = !!input.trim();
  const conditions = dimensions.filter(key => filters[key]?.length);
  const go = (next: number) => { setStep(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (step !== 3 || !ready || sending) return;
    setSending(true); setError('');
    try { const job = await authenticatedRequest<Job>('/conversations/' + id + '/persona-debates', { method: 'POST', json: { input: input.trim(), filters, messageIds:messages.map(m=>m.id) } }); router.push(debateHref(id, job.id)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '문서를 만들지 못했습니다.'); setSending(false); }
  };
  const audience = <div className="wizard-audience" aria-live="polite">
    {preview.loading ? <p className="small muted">조건에 맞는 표본 확인 중…</p> : preview.data && !preview.error && <>
      <div className="wizard-audience-row"><div><p>조건에 맞는 <strong>{preview.data.eligible.toLocaleString()}명</strong> 중 <strong>{preview.data.selected}명</strong>의 의견을 받아요 · <span className="wizard-accent">{conditions.length ? `${conditions.length}개 조건` : '전체'}</span></p><p className="small muted">상세 의견 {preview.data.detail}명 · 간단 의견 {preview.data.jev}명</p></div>
        {step === 2 && <Button type="button" variant="outline" size="sm" disabled={sending || !conditions.length} onClick={() => setFilters({})}>모든 조건 초기화</Button>}</div>
      {preview.data.warnings.map(warning => <Notice key={warning} tone="warning">{warning}</Notice>)}
      {!preview.data.eligible && <Notice tone="warning">선택한 조건에 맞는 페르소나가 없어요. 조건을 줄여 주세요.</Notice>}
    </>}
    {preview.error && <Notice tone="warning">{preview.error}</Notice>}
  </div>;
  return <div className="debate-composer debate-wizard">
    <div className="wizard-intro"><p className="muted">대화의 맥락을 정리하고, 다양한 사람들의 관점을 비교해 보세요.</p><Button asChild variant="outline"><Link href={debateHref(id, 'history')}><History size={16}/>분석 기록</Link></Button></div>
    <ol className="wizard-steps" aria-label="진행 단계">{steps.map((item, index) => <li key={item.label}>
      <button type="button" className="wizard-step" aria-current={index === step ? 'step' : undefined} data-done={index < step || undefined} disabled={sending || (index > 0 && !ready)} onClick={() => go(index)}>
        <span className="wizard-step-dot">{index < step ? <Check size={14}/> : index + 1}</span>{item.label}
      </button></li>)}</ol>
    <form className="card wizard-panel" onSubmit={submit}>
      <div className="wizard-heading"><h2>{steps[step].title}</h2><p className="muted">{steps[step].description}</p></div>
      {step === 0 && <div className="wizard-question">
        <label htmlFor="debate-input" className="sr-only">살펴보고 싶은 논쟁</label>
        <textarea id="debate-input" className="debate-input composer-input" rows={7} required maxLength={800} value={input} disabled={sending} placeholder="예: 약속에 늦으면 벌금을 내기로 했는데, 불가피한 사정에도 예외 없이 적용해야 할까?" onChange={event => setInput(event.target.value)}/>
        <p className="small muted composer-character-count">{input.length} / 800</p>
      </div>}
      {step === 1 && <MessagePicker conversation={conversation} value={messages} onChange={setMessages} disabled={sending}/>}
      {step === 2 && (options.data && !options.error ? <>{audience}<AudienceCards options={options.data.values} conversationId={id} value={filters} onChange={setFilters} disabled={sending}/></> : <div className="stack">
        {options.loading && <p className="small muted" role="status">분석 대상 조건을 불러오고 있습니다…</p>}
        {options.error && <><Notice tone="warning">{options.error} 대상 설정을 불러오지 못해도 쟁점 문서는 작성할 수 있습니다.</Notice><Button type="button" variant="outline" onClick={options.retry}>조건 다시 불러오기</Button></>}
      </div>)}
      {step === 3 && <div className="stack">
        <dl className="wizard-summary">
          <dt>쟁점</dt><dd>{input.trim()}</dd>
          <dt>참고 대화</dt><dd>{messages.length ? `${messages.length}개` : '없음 (질문만으로 작성)'}</dd>
          <dt>분석 대상</dt><dd>{conditions.length ? conditions.map(key => `${dimensionLabels[key]} ${summarize(key, filters)}`).join(' · ') : '전체'}</dd>
        </dl>
        {audience}
        <ol className="wizard-flow">
          <li>담은 대화와 외부 조사로 <strong>판단 문서</strong>를 먼저 만들어요 (최대 3분)</li>
          <li>다음 화면에서 자료·조건을 보완하고 <strong>최종 문서를 확정</strong>해요</li>
          <li>확정한 문서로 <strong>관점별 의견</strong>을 요청해요</li>
        </ol>
        <p className="wizard-caution">직접 담은 최대 20개 발언만 문서 작성에 참고해요. 의견 모델에는 원문 대신 확인한 문서만 전달해요. 생성된 페르소나 의견은 실제 여론조사가 아니에요.</p>
        {error && <Notice tone="error">{error}</Notice>}
        {sending && <AiProgress active title="대화 요약 준비 중" description="요약 작업을 접수하고 있습니다. 다음 화면에서 대화를 정리하는 진행 상태를 확인할 수 있습니다."/>}
      </div>}
      <div className="wizard-nav">
        {step > 0 ? <Button type="button" variant="outline" disabled={sending} onClick={() => go(step - 1)}><ArrowLeft size={16}/>이전</Button> : <span/>}
        {step < 3 ? <Button type="button" disabled={!ready} onClick={() => go(step + 1)}>다음<ArrowRight size={16}/></Button>
          : <Button type="submit" disabled={sending || !ready}>{sending ? '요약 문서 준비 중…' : '판단 문서 만들기'}<ArrowRight size={16}/></Button>}
      </div>
    </form>
  </div>;
}
export function PersonaDebatePage({ conversation }: { conversation: Conversation }) {
  const auth = useAuth(); return <DebateWorkspace key={auth.userId + ':' + conversation.id} conversation={conversation}/>;
}
