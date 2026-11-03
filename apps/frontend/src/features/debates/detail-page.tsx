'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { RotateCcw, ArrowLeft, ArrowUpRight, FileText, History } from 'lucide-react';
import { Card, Empty, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/provider';
import { useQueryResult } from '@/features/conversations/hooks';
import { ApiError, authenticatedRequest } from '@/lib/api';
import { conversationHref, debateHref } from '@/lib/navigation';
import { DebateDocumentEditor } from './document';
import { DebateResults } from './results';
import { AiProgress } from '@/components/ai-progress';
import { failure, type Job } from './types';

const statuses = { pending: '문서 준비 중', processing: '진행 중', review: '문서 검토', completed: '분석 완료', failed: '실패' };
function DetailWorkspace({ conversationId, analysisId }: { conversationId: string; analysisId: string }) {
  const router=useRouter();
  const [restarting,setRestarting]=useState(false);
  async function restart(mode:'document'|'opinions'){if(restarting)return;setRestarting(true);setError('');try{const next=await authenticatedRequest<Job>(`/persona-debates/${analysisId}/restart`,{method:'POST',json:{mode}});router.push(debateHref(conversationId,next.id));}catch(cause){setError(cause instanceof Error?cause.message:'다시 시작하지 못했습니다.');setRestarting(false);}}
  const [job, setJob] = useState<Job | null>(null), [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true), [error, setError] = useState(''), [missing, setMissing] = useState(false);
  useEffect(() => {
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout> | undefined;let failures=0;
    async function load() {
      try {
        const next = await authenticatedRequest<Job>(`/persona-debates/${analysisId}`, { signal: controller.signal });
        if (controller.signal.aborted) return;
        if (next.conversationId !== conversationId) { setMissing(true); return; }
        setJob(next); setError('');failures=0;
        if (['pending', 'processing'].includes(next.status)) timer = setTimeout(() => void load(), 2000);
      } catch (cause) { if (!controller.signal.aborted) { if (cause instanceof ApiError && cause.status === 404) setMissing(true); else {setError(cause instanceof Error ? cause.message : '분석을 불러오지 못했습니다.');if(!(cause instanceof ApiError&&[401,403].includes(cause.status)))timer=setTimeout(()=>void load(),Math.min(15000,2000*2**Math.min(failures++,3)));} } }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [conversationId, analysisId, revision]);
  if (missing) notFound();
  const changed = (next: Job) => { setJob(next); setRevision(value => value + 1); };
  return <><div className="analysis-page-nav"><Button asChild variant="ghost"><Link href={conversationHref(conversationId, 'opinions')}><ArrowLeft size={16}/>새 논쟁 입력</Link></Button><Button asChild variant="outline"><Link href={debateHref(conversationId, 'history')}><History size={16}/>분석 기록</Link></Button></div>
    {loading && <p role="status">분석 문서를 불러오는 중…</p>}{error && <Card><Notice tone="error">{error}</Notice><Button onClick={() => setRevision(value => value + 1)}>다시 조회</Button></Card>}
    {job && <><div className="analysis-title"><span className={`analysis-status status-${job.status}`}>{statuses[job.status]}</span><h2>{job.document?.question ?? job.input}</h2></div>
      {['pending','processing','review','completed'].includes(job.status)&&<AiProgress key={`${job.id}:${job.stage==='refining'||job.stage==='pending'?'summary':'opinions'}`} active={['pending','processing'].includes(job.status)} done={['review','completed'].includes(job.status)}
        completed={job.processed} total={job.selected}
        title={job.status==='review'?'자료·최종 문서 검토 준비 완료':job.status==='completed'?'의견 분석 완료':job.stage==='refining'||job.stage==='pending'?'대화 핵심 요약 생성 중':job.stage==='sampling'?'분석할 페르소나 선택 중':job.stage==='detail'?'상세·JEV 의견 생성 중':'남은 JEV 의견 생성 중'}
        description={job.status==='review'?'자료와 조건을 보완하고, 하단 최종 마크다운 문서를 확인·수정한 다음 의견을 요청하세요.':job.status==='completed'?'의견 분포와 개별 응답을 확인할 수 있습니다.':job.selected>0&&job.processed>=job.selected?'받은 응답을 집계하고 결과를 저장하고 있습니다.':job.stage==='refining'||job.stage==='pending'?'선택 발언과 핵심 정보 조사 결과로 판단 목적·제약·가정을 정리합니다. 전체 최대3분 안에서 문서를 보완합니다.':job.stage==='sampling'?'선택한 조건에서 최대 200명을 고르고 있습니다.':'확정한 문서만으로 상세 최대20명과 JEV 최대180명에게 동시에 의견을 요청합니다.'}/>}
      {job.status === 'failed' && <Card><Notice tone="error">{failure(job.errorCode)}</Notice><p className="small muted">기존 실패 기록은 보존됩니다. 같은 입력·대상 필터·발언자로 새 작업을 만듭니다.</p><div className="actions"><Button disabled={restarting} onClick={()=>void restart(job.document&&!job.document.draftOnly?'opinions':'document')}><RotateCcw size={16}/>{restarting?'다시시작 중…':job.document&&!job.document.draftOnly?'AI 의견 요청 다시시작':'문서 생성 다시시작'}</Button>{job.document&&!job.document.draftOnly&&<Button variant="outline" disabled={restarting} onClick={()=>void restart('document')}>문서부터 다시 만들기</Button>}<Button asChild variant="outline"><Link href={conversationHref(conversationId, 'opinions')}>새 논쟁 입력</Link></Button></div>{restarting&&<AiProgress active title="다시시작 요청 중" description="기존 입력과 필터를 유지한 새 작업을 준비합니다."/>}</Card>}
      {job.document?.draftOnly&&<Card title="문서 미리보기"><p className="small muted">질문과 직접 선택한 원문을 먼저 준비했습니다. AI는 짧은 요약·쟁점·응답 기준만 채웁니다.</p><h3>{job.document.question}</h3><p>{job.document.summary}</p>{job.document.statements.map(m=><article className="document-source" key={m.messageId}><strong>{m.speaker}</strong><blockquote>{m.text}</blockquote></article>)}</Card>}
      {job.document && job.status === 'review' && <DebateDocumentEditor key={`${job.id}:${job.revision}`} job={job} onChanged={changed}/>}
      {job.document && !job.document.draftOnly && job.status !== 'review' && <details className="card"><summary>분석에 사용한 쟁점 문서 보기</summary><DebateDocumentEditor key={`${job.id}:${job.revision}`} job={job} onChanged={changed} readOnly/></details>}
      {job.status === 'completed' && job.result && <DebateResults job={job} conversationId={conversationId}/>}</>}
  </>;
}
export function DebateDetailPage(props: { conversationId: string; analysisId: string }) {
  const auth = useAuth(); return <DetailWorkspace key={`${auth.userId}:${props.conversationId}:${props.analysisId}`} {...props}/>;
}
function HistoryWorkspace({ conversationId }: { conversationId: string }) {
  const [page, setPage] = useState(1);
  const query = useQueryResult(`history:${conversationId}:${page}`, signal => authenticatedRequest<{ items: Job[]; total: number }>(`/conversations/${conversationId}/persona-debates/history?page=${page}`, { signal }));
  return <Card title="논쟁 분석 기록" action={<Button asChild><Link href={conversationHref(conversationId, 'opinions')}>새 논쟁 입력</Link></Button>}>
    <p className="muted">문서와 결과가 분석별로 보관됩니다. 검토 중인 문서를 이어서 수정할 수 있습니다.</p>
    {query.loading ? <p role="status">기록을 불러오는 중…</p> : query.error ? <><Notice tone="error">{query.error}</Notice><Button onClick={query.retry}>다시 조회</Button></> : query.data?.items.length ? <div className="analysis-history">{query.data.items.map(job => <Link className="analysis-history-item" key={job.id} href={debateHref(conversationId, job.id)}><FileText size={21}/><div><span className={`analysis-status status-${job.status}`}>{statuses[job.status]}</span><h3>{job.input}</h3><p className="small muted">{job.createdAt ? new Date(job.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' }) : ''}</p></div><ArrowUpRight size={17}/></Link>)}</div> : <Empty title="아직 분석 기록이 없습니다">논쟁을 입력해 첫 쟁점 문서를 만들어 보세요.</Empty>}
    {query.data && query.data.total > 20 && <div className="actions"><Button variant="outline" disabled={page === 1 || query.loading} onClick={() => setPage(page - 1)}>이전</Button><span>{page} / {Math.ceil(query.data.total / 20)}</span><Button variant="outline" disabled={page * 20 >= query.data.total || query.loading} onClick={() => setPage(page + 1)}>다음</Button></div>}
  </Card>;
}
export function DebateHistoryPage({ conversationId }: { conversationId: string }) { const auth = useAuth(); return <HistoryWorkspace key={`${auth.userId}:${conversationId}`} conversationId={conversationId}/>; }
