import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, ConfirmDialog, Empty, Notice } from '@/components/layout';
import { getHealth } from '@/lib/api';
import { conversationHref } from '@/lib/navigation';
import { formatDate, type Conversation } from '@/features/conversations/demo';

export { LoginPage } from '@/features/auth/login-page';

export function ConversationList({ conversations, onDelete }: { conversations: Conversation[]; onDelete: (id: string) => void }) {
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState<Conversation>();
  const visible = conversations.filter(item => item.title.includes(query.trim()));
  return <>
    <Card title="보관한 대화"><label>대화 검색<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="대화 제목으로 검색하세요" /></label>
      {visible.length ? <div className="conversation-list">{visible.map(item => <article key={item.id} className="conversation-row"><div><h3>{item.title}</h3><p className="small muted">참여자 {item.participants.join(', ')} · {formatDate(item.messages[0].date)} – {formatDate(item.messages.at(-1)!.date)}</p><p className="small">합성 예시 메시지 {item.messages.length}개</p></div><div className="actions"><Button asChild><Link href={conversationHref(item.id)}>대화 열기</Link></Button><Button variant="danger-outline" onClick={() => setDeleting(item)}>삭제</Button></div></article>)}</div> : <Empty title={query ? '검색 결과가 없습니다' : '보관한 대화가 없습니다'}>{query ? '다른 제목으로 검색해 주세요.' : '새 대화 업로드에서 예시 대화를 추가해 보세요.'}</Empty>}
    </Card>
    <Card title="대화 보관 안내"><p>대화 원문을 확인한 뒤 통계, 모순 후보, 관점별 의견과 일정을 살펴보세요.</p><p className="muted">데모에서 삭제하면 이 탭의 예시 대화와 일정이 제거됩니다. 새로고침하면 초기 예시로 돌아갑니다.</p></Card>
    {deleting && <ConfirmDialog title="이 대화를 삭제할까요?" onCancel={() => setDeleting(undefined)} onConfirm={() => { onDelete(deleting.id); setDeleting(undefined); }}>{deleting.title}의 예시 대화와 일정이 현재 탭에서 삭제됩니다.</ConfirmDialog>}
  </>;
}

export function UploadPage({ onAdd }: { onAdd: (title: string) => string }) {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [sample, setSample] = useState(false);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(''); setSample(false); setFileName(file?.name ?? ''); setPreview('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.txt')) { setError('.txt 파일을 선택해 주세요.'); return; }
    // 서버 제한이 아니라 브라우저 미리보기의 메모리 보호 한도다.
    if (file.size > 2 * 1024 * 1024) { setError('로컬 미리보기는 2MB 이하 파일만 지원합니다. 서버 업로드 정책은 미확정입니다.'); return; }
    try { const content = await file.text(); setPreview(content.slice(0, 4000)); if (!content.trim()) setError('파일이 비어 있습니다.'); }
    catch { setError('파일을 읽지 못했습니다. 다른 파일을 선택해 주세요.'); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!sample) return;
    const id = onAdd(title.trim());
    router.push(conversationHref(id));
  }
  return <>
    <Notice>파일은 브라우저에서만 미리봅니다. 서버 업로드·파싱은 연결 전이며, 예시 대화만 데모에 추가할 수 있습니다.</Notice>
    <form onSubmit={submit} className="stack"><Card title="1. 대화 파일 선택"><p className="muted">내보낸 .txt 대화 기록을 선택하세요.</p><label className="upload-box">대화 파일<input type="file" accept=".txt,text/plain" onChange={readFile} /></label><p className="small muted">로컬 미리보기: 최대 2MB, 앞부분 4,000자. 실제 업로드 정책과 별개입니다.</p><Button type="button" variant="outline" onClick={() => { setSample(true); setFileName('합성 예시 대화'); setPreview('2026.09.29 09:00 A: 제가 금요일까지 제출할게요.\n2026.09.30 09:00 A: 제가 제출하기로 한 적은 없어요.'); setTitle('새 팀 프로젝트 대화'); setError(''); }}>예시 파일로 체험</Button>{error && <Notice tone="error">{error}</Notice>}</Card>
    <Card title="2. 내용 미리보기">{preview ? <><p className="small muted">{fileName} · {sample ? '합성 데이터' : '원문 앞부분 / 파싱 전'}</p><pre className="file-preview">{preview}</pre></> : <Empty title="선택한 파일이 없습니다">파일을 선택하거나 예시 파일로 체험해 주세요.</Empty>}</Card>
    <Card title="3. 대화 정보"><label>대화 제목<input value={title} onChange={event => setTitle(event.target.value)} required maxLength={80} placeholder="대화 제목을 입력하세요" /></label><div className="actions"><Button type="submit" disabled={!sample || !title.trim()}>예시 대화 추가</Button><Button asChild variant="outline"><Link href="/conversations">취소</Link></Button></div>{!sample && fileName && <p className="small muted">선택한 실제 파일의 서버 저장은 서비스 연결 후 가능합니다.</p>}</Card></form>
  </>;
}

export function HealthPage() {
  const [connection, setConnection] = useState<'loading' | 'connected' | 'failed'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    getHealth(controller.signal).then(() => { if (!controller.signal.aborted) setConnection('connected'); }).catch(() => { if (!controller.signal.aborted) setConnection('failed'); });
    return () => controller.abort();
  }, [attempt]);
  return <Card title="개발 환경 연결 상태"><Notice tone={connection === 'failed' ? 'error' : connection === 'connected' ? 'success' : 'info'}>{({ loading: '백엔드 연결 확인 중', connected: '백엔드 연결 정상', failed: '백엔드 연결 실패' })[connection]}</Notice><div className="actions"><Button disabled={connection === 'loading'} onClick={() => { setConnection('loading'); setAttempt(value => value + 1); }}>다시 확인</Button><Button asChild variant="outline"><Link href="/api/docs" target="_blank" rel="noreferrer">API 문서 열기</Link></Button></div></Card>;
}
