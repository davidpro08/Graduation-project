import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, Empty, Notice } from '@/components/layout';
import { conversationHref } from '@/lib/navigation';
import { formatDate, type Conversation, type Message, type SavedSchedule } from '@/features/conversations/demo';

export function MessagesPage({ conversation, messageId }: { conversation: Conversation; messageId?: string }) {
  const [search, setSearch] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const highlighted = useRef<HTMLDivElement>(null);
  useEffect(() => { highlighted.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); highlighted.current?.focus({ preventScroll: true }); }, [messageId]);
  const messages = conversation.messages.filter(item => (!speaker || item.speaker === speaker) && (!from || item.date >= from) && (!to || item.date <= to) && item.text.includes(search));
  return <>
    <Card title="대화 원문"><div className="filters"><label className="grow">메시지 검색<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="메시지 내용을 검색하세요" /></label><label>참여자<select value={speaker} onChange={event => setSpeaker(event.target.value)}><option value="">전체 참여자</option>{conversation.participants.map(name => <option key={name}>{name}</option>)}</select></label><label>시작일<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>종료일<input type="date" value={to} min={from} onChange={event => setTo(event.target.value)} /></label></div>
      {from && to && from > to && <Notice tone="error">종료일은 시작일 이후로 선택해 주세요.</Notice>}
      <p className="small muted">{messages.length}개 표시 · 실제 대화가 아닌 합성 예시입니다.</p>
      <div className="message-list">{messages.map((message, index) => <div key={message.id}>
        {(index === 0 || messages[index - 1].date !== message.date) && <p className="date-divider">{formatDate(message.date)}</p>}
        <div ref={message.id === messageId ? highlighted : undefined} tabIndex={message.id === messageId ? -1 : undefined} className={`message ${message.id === messageId ? 'highlighted' : ''}`}>
          <span className="avatar">{message.speaker}</span><div><p className="message-meta"><strong>{message.speaker}</strong><time dateTime={`${message.date}T${message.time}`}>{message.time}</time>{message.id === messageId && <span className="evidence-label">선택한 근거</span>}</p><p>{message.text}</p></div>
        </div></div>)}{!messages.length && <Empty title="일치하는 메시지가 없습니다">검색어와 참여자, 기간을 확인해 주세요.</Empty>}</div>
    </Card><Card title="원문에서 시작하는 분석"><p className="muted">모순 후보와 관점별 의견은 앞뒤 맥락을 함께 확인해 주세요.</p><div className="actions"><Button asChild><Link href={conversationHref(conversation.id, 'contradiction')}>모순 후보 보기</Link></Button><Button asChild variant="outline"><Link href={conversationHref(conversation.id, 'opinions')}>관점별 의견 보기</Link></Button><Button asChild variant="outline"><Link href={conversationHref(conversation.id, 'schedules')}>일정 보기</Link></Button></div></Card>
  </>;
}

export function StatisticsPage({ conversation }: { conversation: Conversation }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [speaker, setSpeaker] = useState('');
  const messages = conversation.messages.filter(item => (!from || item.date >= from) && (!to || item.date <= to) && (!speaker || item.speaker === speaker));
  const counts = conversation.participants.map(name => ({ name, count: messages.filter(item => item.speaker === name).length }));
  const max = Math.max(1, ...counts.map(item => item.count));
  const buckets = ['00–06시', '06–12시', '12–18시', '18–24시'].map((label, index) => ({ label, count: messages.filter(item => Math.floor(Number(item.time.split(':')[0]) / 6) === index).length }));
  return <>
    <Card title="조회 조건"><div className="filters"><label>시작일<input type="date" value={from} onChange={event => setFrom(event.target.value)} /></label><label>종료일<input type="date" min={from} value={to} onChange={event => setTo(event.target.value)} /></label><label>참여자<select value={speaker} onChange={event => setSpeaker(event.target.value)}><option value="">전체 참여자</option>{conversation.participants.map(name => <option key={name}>{name}</option>)}</select></label></div>{from && to && from > to && <Notice tone="error">종료일은 시작일 이후로 선택해 주세요.</Notice>}</Card>
    <div className="metrics"><Card><p className="muted">메시지 수</p><strong className="metric">{messages.length}<span>개</span></strong></Card><Card><p className="muted">발언 참여자</p><strong className="metric">{new Set(messages.map(item => item.speaker)).size}<span>명</span></strong></Card><Card><p className="muted">평균 응답 시간</p><strong className="metric metric-small">집계 준비 중</strong><p className="small muted">응답 판정 기준 확정 후 제공</p></Card></div>
    <Card title="참여자별 메시지 수">{messages.length ? <div className="bar-chart" role="img" aria-label={counts.map(item => `${item.name}: ${item.count}개`).join(', ')}>{counts.map(item => <div className="bar-column" key={item.name}><strong>{item.count}개</strong><div className="bar-track"><div className="bar" style={{ height: `${item.count / max * 100}%` }} /></div><span>{item.name}</span></div>)}</div> : <Empty title="조회한 기간의 메시지가 없습니다" />}</Card>
    <Card title="시간대별 활동"><div className="time-buckets">{buckets.map(item => <div key={item.label}><p className="muted">{item.label}</p><strong>{messages.length ? Math.round(item.count / messages.length * 100) : 0}%</strong><p className="small">{item.count}개</p></div>)}</div><p className="small muted">표시된 합성 메시지만 직접 집계했습니다. 서버 통계와 응답 시간 집계는 미연결입니다.</p></Card>
  </>;
}

type AnalysisState = 'pending' | 'processing' | 'completed' | 'failed';
function useDemoAnalysis() {
  const [state, setState] = useState<AnalysisState>('completed');
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  function run(fail: boolean) {
    timers.current.forEach(clearTimeout);
    setState('pending');
    timers.current = [setTimeout(() => setState('processing'), 450), setTimeout(() => setState(fail ? 'failed' : 'completed'), 1400)];
  }
  return { state, run };
}

function AnalysisControls({ state, run }: ReturnType<typeof useDemoAnalysis>) {
  const [fail, setFail] = useState(false);
  const busy = state === 'pending' || state === 'processing';
  return <Card title="분석 실행" action={<Button disabled={busy} onClick={() => run(fail)}>{state === 'failed' ? '다시 시도' : busy ? '분석 진행 중' : '새 분석 체험'}</Button>}><label className="checkbox-label"><input type="checkbox" checked={fail} onChange={event => setFail(event.target.checked)} disabled={busy} />실패 상태 체험</label><p className="small muted">AI 호출 없이 상태 전환과 사전에 작성한 예시 결과를 보여줍니다.</p>{busy && <Notice>{state === 'pending' ? '분석 대기 중 · 예시 작업을 준비합니다.' : '분석 처리 중 · 예시 결과를 준비합니다.'}</Notice>}{state === 'failed' && <Notice tone="error">예시 분석 실패 · 실패 상태 체험을 끄고 다시 시도해 주세요.</Notice>}</Card>;
}

function Evidence({ conversation, message, title }: { conversation: Conversation; message: Message; title: string }) {
  return <article className="evidence-card"><h3>{title}</h3><p className="small muted">{message.speaker} · {formatDate(message.date)} {message.time}</p><blockquote>“{message.text}”</blockquote><Button asChild variant="evidence"><Link href={conversationHref(conversation.id, 'messages', message.id)}>원문 보기</Link></Button></article>;
}

export function ContradictionPage({ conversation }: { conversation: Conversation }) {
  const analysis = useDemoAnalysis();
  return <><Notice>AI가 제안한 모순 후보입니다. 사실이나 책임을 판정하지 않습니다. 원문과 앞뒤 맥락을 함께 확인하세요.</Notice><AnalysisControls {...analysis} />
    {analysis.state === 'completed' && (conversation.messages.length >= 5 ? <><Card title="모순 후보 1"><p className="badge">확인 필요 · 제출 약속</p><p>A의 제출 약속과 이후 발언 사이에 기억 차이가 있을 수 있습니다.</p><div className="evidence-grid"><Evidence conversation={conversation} title="앞선 발언" message={conversation.messages[0]} /><Evidence conversation={conversation} title="이후 발언" message={conversation.messages[3]} /></div></Card><Card title="함께 확인할 내용"><p>중간에 일정이나 역할이 변경되었는지 원문을 확인해 주세요.</p><p className="muted">두 발언만으로 책임을 단정하지 말고 서로의 기억과 당시 상황을 이야기해 보세요.</p></Card></> : <Card><Empty title="모순 후보가 없습니다">이 예시 대화에는 사전에 작성한 후보가 없습니다. 실제 AI 분석 결과는 아닙니다.</Empty></Card>)}
  </>;
}

const perspectives = [
  { title: '약속을 중시하는 관점', opinion: '앞선 제출 약속을 기준으로 기대가 생겼을 수 있습니다.', solution: '담당 역할과 약속한 내용을 원문으로 함께 확인해 보세요.' },
  { title: '상황 변화를 살피는 관점', opinion: '중간에 일정이나 역할이 바뀌었을 수 있습니다.', solution: '변경 이력과 현재 마감일을 서로 확인해 보세요.' },
  { title: '대화를 중재하는 관점', opinion: '책임을 단정하기보다 서로의 기억 차이를 확인하세요.', solution: '지금 필요한 담당자와 마감일을 짧고 명확하게 합의해 보세요.' },
];

export function OpinionsPage({ conversation }: { conversation: Conversation }) {
  const analysis = useDemoAnalysis();
  return <><Notice>서로 다른 관점의 예시 의견입니다. 실제 사람의 의견이나 설문 결과가 아니며 AI 서비스 연결 전입니다.</Notice><AnalysisControls {...analysis} />
    {analysis.state === 'completed' && (conversation.messages.length >= 5 ? <><div className="perspective-grid">{perspectives.map(item => <Card key={item.title} title={item.title}><p>{item.opinion}</p><div className="suggestion"><h3>대화 제안</h3><p>{item.solution}</p></div><Button asChild variant="evidence"><Link href={conversationHref(conversation.id, 'messages', conversation.messages[0].id)}>근거 원문 보기</Link></Button></Card>)}</div><Card title="의견을 활용하는 방법"><p>한 관점을 정답으로 고르기보다, 원문과 현재 상황을 비교하며 대화의 출발점으로 활용하세요.</p></Card></> : <Card><Empty title="관점별 의견이 없습니다">이 예시 대화에는 사전에 작성한 의견이 없습니다.</Empty></Card>)}
  </>;
}

function ScheduleForm({ schedule, onSave, onCancel }: { schedule: SavedSchedule; onSave: (schedule: SavedSchedule) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(schedule);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get('title') ?? '').trim();
    const date = String(data.get('date') ?? '');
    const time = String(data.get('time') ?? '');
    if (!title || !date || !time) return;
    onSave({ ...draft, title, date, time });
  }
  return <form onSubmit={submit} className="stack"><label>일정 제목<input name="title" value={draft.title} onChange={event => setDraft({ ...draft, title: event.target.value })} required maxLength={80} autoFocus /></label><div className="filters"><label>날짜<input name="date" type="date" value={draft.date} onChange={event => setDraft({ ...draft, date: event.target.value })} required /></label><label>시간<input name="time" type="time" value={draft.time} onChange={event => setDraft({ ...draft, time: event.target.value })} required /></label></div><div className="actions"><Button type="submit">{schedule.id.startsWith('candidate-') && !schedule.time ? '확인하고 저장' : '변경 저장'}</Button><Button type="button" variant="outline" onClick={onCancel}>취소</Button></div></form>;
}

export function SchedulesPage({ conversation, schedules, onSave }: { conversation: Conversation; schedules: SavedSchedule[]; onSave: (schedule: SavedSchedule) => void }) {
  const [editing, setEditing] = useState<SavedSchedule>();
  const [notice, setNotice] = useState('');
  const candidateId = `candidate-${conversation.id}`;
  const candidate = conversation.messages.length >= 5 && !schedules.some(item => item.id === candidateId);
  const saved = schedules.filter(item => item.conversationId === conversation.id);
  function save(schedule: SavedSchedule) { onSave(schedule); setEditing(undefined); setNotice('현재 탭에 예시 일정을 저장했습니다. 서버·외부 캘린더에는 저장되지 않습니다.'); }
  return <><Notice>AI가 추출한 일정 후보는 날짜와 시간을 확인한 뒤 저장하세요. 현재 화면은 합성 예시이며 외부 캘린더에 연결되지 않습니다.</Notice>{notice && <Notice tone="success">{notice}</Notice>}
    <Card title="확인할 일정 후보">{candidate ? <div className="stack"><div className="card-heading"><h3>프로젝트 제출</h3><span className="badge warning">날짜·시간 확인 필요</span></div><p>후보 날짜: 2026.10.02 · 시간 미정</p><p className="small muted">“금요일”은 메시지 작성일을 기준으로 제안한 날짜입니다. 시간은 직접 입력해 주세요.</p><Evidence conversation={conversation} title="추출 근거" message={conversation.messages[0]} />{editing?.id === candidateId ? <ScheduleForm key={editing.id} schedule={editing} onSave={save} onCancel={() => setEditing(undefined)} /> : <Button onClick={() => setEditing({ id: candidateId, conversationId: conversation.id, title: '프로젝트 제출', date: '2026-10-02', time: '', messageId: conversation.messages[0].id })}>날짜·시간 확인</Button>}</div> : <Empty title="확인할 일정 후보가 없습니다">후보를 모두 확인했거나 이 예시 대화에 일정이 없습니다.</Empty>}</Card>
    <Card title="확정된 일정">{saved.length ? saved.map(schedule => <article className="schedule-row" key={schedule.id}><div className="card-heading"><div><h3>{schedule.title}</h3><p>{formatDate(schedule.date)} · {schedule.time}</p></div><span className="badge success">확정</span></div>{editing?.id === schedule.id ? <ScheduleForm key={editing.id} schedule={editing} onSave={save} onCancel={() => setEditing(undefined)} /> : <div className="actions"><Button variant="outline" onClick={() => setEditing(schedule)}>일정 수정</Button><Button asChild variant="evidence"><Link href={conversationHref(conversation.id, 'messages', schedule.messageId)}>근거 원문 보기</Link></Button></div>}</article>) : <Empty title="확정된 일정이 없습니다">후보의 날짜와 시간을 확인하면 여기에 표시됩니다.</Empty>}</Card>
  </>;
}
