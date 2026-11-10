import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, FilePenLine, Save } from 'lucide-react';
import { Card, Empty, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AiProgress } from '@/components/ai-progress';
import { authenticatedRequest } from '@/lib/api';
import { conversationHref, debateHref } from '@/lib/navigation';
import { FinalDocumentPanel, useDocumentComposition } from './final-document';
import { dimensionLabels, type Dimension } from './types';
import type { DebateDocument, DocumentEdit, Job } from './types';

function editable(document: DebateDocument, revision: number): DocumentEdit {
  return { markdown:document.markdown,markdownEdited:document.markdownEdited,decisionGoal:document.decisionGoal,constraints:document.constraints,assumptions:document.assumptions,answerSchema:document.answerSchema,facts:document.facts,revision, question: document.question, proposition: document.proposition, context: document.context,summary:document.summary??document.context,
    keyIssues: document.keyIssues, supportingLogic: document.supportingLogic, opposingLogic: document.opposingLogic, evidenceMessageIds: document.evidenceMessageIds };
}
export function DebateDocumentEditor({ job, onChanged, readOnly = false }: { job: Job; onChanged: (job: Job) => void; readOnly?: boolean }) {
  const original = job.document!;
  const router=useRouter();
  const [draft, setDraft] = useState<DocumentEdit>(() => editable(original, job.revision));
  const [baseline, setBaseline] = useState(() => JSON.stringify(editable(original, job.revision)));
  const [speaker, setSpeaker] = useState('all'), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [starting,setStarting]=useState(false);
  const composition=useDocumentComposition(job,draft);
  const dirty = JSON.stringify({...draft,markdown:composition.markdown}) !== baseline;
  const [queries,setQueries]=useState((original.research?.queries??original.researchQueries??[]).join('\n'));
  const [researchReviewed,setResearchReviewed]=useState(!original.researchUpdated);
  const sources = original.statements.filter(source => speaker === 'all' || (source.participantId ?? source.speaker) === speaker);
  const people = [...new Map(original.statements.map(source => [source.participantId ?? source.speaker, source.speaker])).entries()];
  async function saveAndRun(run: boolean,research=false) {
    if (busy||composition.pending) return;
    const searchQueries=queries.split('\n').map(q=>q.trim()).filter(Boolean);
    if(research&&(!searchQueries.length||searchQueries.length>3||searchQueries.some(q=>q.length<2||q.length>150))){setError('검색어는 1~3개, 각 2~150자로 입력해 주세요.');return;}
    if(composition.error){setError(composition.error);return;}
    if(!composition.markdown.trim()||composition.markdown.length>10000){setError('최종 문서를 1~10,000자로 작성해 주세요.');return;}
    const edited = { ...draft,markdown:composition.markdown,researchReviewed, question: draft.question.trim(), proposition: draft.proposition.trim(), context: draft.context.trim(),
      keyIssues: draft.keyIssues.map(line => line.trim()).filter(Boolean), supportingLogic: draft.supportingLogic.map(line => line.trim()).filter(Boolean), opposingLogic: draft.opposingLogic.map(line => line.trim()).filter(Boolean) };
    if (!edited.question || !edited.proposition || !edited.context || !edited.summary?.trim() || edited.summary.length>2000 || [edited.keyIssues, edited.supportingLogic, edited.opposingLogic].some(lines => lines.length > 6 || lines.some(line => line.length > 500))) {
      setError('질문·찬성 기준·맥락을 입력하고, 논리 항목은 최대 6개·한 항목 500자 이하로 작성해 주세요.'); return;
    }
    setBusy(true);setStarting(run); setError('');
    try {
      let next = job;
      let revision = draft.revision;
      if (dirty||original.researchUpdated) {
        next = await authenticatedRequest<Job>(`/persona-debates/${job.id}/document`, { method: 'PATCH', json: edited });
        revision = next.revision;
        const saved = { ...edited, revision }; setDraft(saved); setBaseline(JSON.stringify(saved));
      }
      if(research){next=await authenticatedRequest<Job>(`/persona-debates/${job.id}/research`,{method:'POST',json:{revision,queries:searchQueries}});router.push(debateHref(job.conversationId,next.id));return;}
      if (run) next = await authenticatedRequest<Job>(`/persona-debates/${job.id}/run`, { method: 'POST', json: { revision } });
      onChanged(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '문서를 저장하지 못했습니다.'); }
    finally { setBusy(false);setStarting(false); }
  }
  return <Card className="debate-document"><div className="document-heading"><div className="document-icon"><FilePenLine size={23}/></div><div><p className="eyebrow">{readOnly ? '분석에 사용한 문서' : '자료·조건 보완과 최종 문서 확인'}</p><h2>논쟁 판단 문서</h2></div><span className="document-state">{readOnly ? '확정' : dirty ? '수정 중' : '저장됨'} · v{draft.revision}</span></div>
    <Notice>대화·대상 설정 → 자료와 조건 보완 → 하단 최종 문서 확인 → 페르소나 의견 분석 순서입니다. 직접 선택한 원문은 근거 확인용이며, 의견 분석에는 확정한 최종 문서를 전달합니다.</Notice>
    {original.basedOn&&<Button asChild variant="link"><Link href={debateHref(job.conversationId,original.basedOn.id)}>재조사 이전 문서 보기 · v{original.basedOn.revision}</Link></Button>}
    {original.warnings?.map(warning=><Notice tone="warning" key={warning}>{warning}</Notice>)}
    {original.sourceCoverage&&<p className="small muted">{original.sourceCoverage.mode==='manual'?`직접 선택한 대화 ${original.sourceCoverage.selectedCount??original.sourceCoverage.scannedMessages}개 참고 · 빠른 초안`:original.sourceCoverage.mode==='keyword'?`빠른 초안 · 검색어: ${original.sourceCoverage.keywords?.join(', ')||'없음'} · 일치 후보 ${original.sourceCoverage.matchedMessages??0}개 · 참고 ${original.sourceCoverage.scannedMessages}개`:`대화 ${original.sourceCoverage.scannedMessages}개 조사 · 요약 성공 ${original.sourceCoverage.successfulChunks}개 구간`}</p>}
    {!readOnly && <p className="muted">같은 화면에서 조사 자료와 조건을 보완하고, 맨 아래 조합된 문서를 확인·수정하세요.</p>}
    <section className="document-source stack"><h3>1차 검토에서 선택한 조건</h3><p>선택 대화 {original.selectedMessageIds?.length??original.statements.length}개</p><p className="small muted">{Object.entries(job.filters).filter(([,values])=>values?.length).map(([key,values])=>`${dimensionLabels[key as Dimension]}: ${values!.join(', ')}`).join(' · ')||'페르소나 전체 조건'}</p></section>
    {!!original.factEvidence?.length&&<section className="stack"><h3>문서 항목과 원문 근거</h3><p className="small muted">생성 시 연결한 근거입니다. 대화에 나온 정보도 외부 검증된 사실은 아닙니다. 아래 사실을 수정해 저장하면 기존 항목 연결은 해제됩니다.</p>{original.factEvidence.map((f,i)=><article className="document-source" key={i}><strong>{{reported:'대화에 나온 정보',opinion:'참여자의 의견',assumption:'가정',unknown:'미확인'}[f.kind]}</strong><p>{f.text}</p>{f.quote&&<blockquote>{f.quote}</blockquote>}{f.messageId&&<Button asChild variant="outline"><Link href={conversationHref(job.conversationId,'messages',f.messageId)}>근거 원문 확인</Link></Button>}</article>)}</section>}
    {original.research&&<section className="stack"><h3>핵심 정보 외부 조사</h3><Notice tone={original.research.status==='ready'?'info':'warning'}>{{unconfigured:'검색 API가 연결되지 않아 외부 조사를 수행하지 않았습니다.',not_needed:'외부 검색어가 생성되지 않았습니다. 필요한 자료는 직접 보완해 주세요.',ready:'관련 외부 자료를 확보했습니다. 검색 결과가 현재 조건에 맞는지 확인해 주세요.',partial:'일부 자료만 확보했습니다.',failed:'외부 자료를 확보하지 못했습니다. 미확인 정보를 확정된 사실로 사용하지 마세요.'}[original.research.status]}</Notice>{original.research.queries.length>0&&<p className="small muted">조사 검색어: {original.research.queries.join(' · ')}</p>}{original.research.findings.map((f,i)=><article className="document-source" key={i}><p>{f.snippetId?'판단에 관련된 원문 발췌 (조건·시점 확인 필요)':f.text}</p><blockquote>{f.quote}</blockquote><span className="small muted">출처 {f.sourceId} · 검색 자료에 근거한 설명</span></article>)}{original.research.sources.map(source=><article className="document-source" key={source.id}><strong>{source.id} · {source.title}</strong><p className="small muted">발행일: {source.publishedAt??'미확인'} · 조회: {new Date(source.retrievedAt).toLocaleString('ko-KR')}</p><p>{source.content}</p><a href={source.url} target="_blank" rel="noopener noreferrer" className="button button-outline">출처 열기</a></article>)}<p className="small muted">검색 결과 요약을 기반으로 정리했습니다. 원문 전체의 검증·개인 예산 확정·실제 계약 가격 확인을 대신하지 않습니다. 아래 사실 항목을 수정해도 이 조사 당시 기록은 유지됩니다.</p></section>}
    {original.research?.enrichment&&<Notice tone={original.research.enrichment.status==='failed'?'warning':'info'}>자료 정리: {{completed:'완료',failed:'실패',skipped:'미실행'}[original.research.enrichment.status]} · 시도 {original.research.enrichment.attempts}회{original.research.enrichment.errorCodes.length>0&&` · 오류 ${original.research.enrichment.errorCodes.join(', ')}`}</Notice>}
    {original.research?.queryResults?.map(result=><p className="small muted" key={result.query}>{result.query} · {result.status==='ready'?`출처 ${result.sourceIds.join(', ')}`:result.status==='empty'?'자료 없음':`검색 실패 (${result.errorCode})`}</p>)}
    {!readOnly&&<section className="document-source stack"><h3>자료 다시 조사하기</h3><label>공개 정보 검색어 (한 줄에 하나, 최대 3개)<textarea rows={3} value={queries} disabled={busy} onChange={e=>setQueries(e.target.value)}/></label><p className="small muted">제품 등급·용량·구매 경로처럼 비교 조건을 구체적으로 적으세요. 개인 대화·이름·연락처는 넣지 마세요. 현재 편집본을 저장하고 새 조사 기록을 만듭니다. 기존 문서는 보존됩니다.</p><Button type="button" variant="outline" disabled={busy||composition.pending||!queries.trim()} onClick={()=>void saveAndRun(false,true)}>현재 조건으로 새 문서에서 다시 조사</Button></section>}
    <fieldset disabled={readOnly||busy} className="stack"><legend>답변 유형·분류 기준</legend><label>답변 유형<select value={draft.answerSchema?.kind??'stance'} onChange={e=>setDraft({...draft,answerSchema:e.target.value==='numeric'?{kind:'numeric',unit:'원',basis:'1인당 부담 금액',options:[{id:'o1',label:'0~10,000원 미만',min:0,max:10000},{id:'o2',label:'10,000~20,000원 미만',min:10000,max:20000},{id:'o3',label:'20,000원 이상',min:20000,max:null},{id:'o0',label:'정보 부족/판단 보류'}]}:{kind:e.target.value as 'stance'|'choice',unit:'',basis:'질문에 맞는 항목 선택',options:[{id:'o1',label:'선택 1'},{id:'o2',label:'선택 2'},{id:'o0',label:'정보 부족/판단 보류'}]}})}><option value="stance">찬반형</option><option value="numeric">수치형</option><option value="choice">선택형</option></select></label>
    {draft.answerSchema&&<><label>판단 목적<Input maxLength={300} value={draft.decisionGoal??''} onChange={e=>setDraft({...draft,decisionGoal:e.target.value})}/></label><label>주어진 제약·확인할 조건<textarea rows={4} value={(draft.constraints??[]).join('\n')} onChange={e=>setDraft({...draft,constraints:e.target.value.split('\n').filter(Boolean)})}/></label><label>가정·비교할 시나리오<textarea rows={3} value={(draft.assumptions??[]).join('\n')} onChange={e=>setDraft({...draft,assumptions:e.target.value.split('\n').filter(Boolean)})}/></label><label>단위<Input value={draft.answerSchema.unit} maxLength={30} onChange={e=>setDraft({...draft,answerSchema:{...draft.answerSchema!,unit:e.target.value}})}/></label><label>답변 대상·계산 기준<Input maxLength={500} value={draft.answerSchema.basis} onChange={e=>setDraft({...draft,answerSchema:{...draft.answerSchema!,basis:e.target.value}})}/></label>{draft.answerSchema.options.map((o,i)=><div className="document-option" key={o.id}><label>분류 {i+1}<Input maxLength={120} value={o.label} onChange={e=>setDraft({...draft,answerSchema:{...draft.answerSchema!,options:draft.answerSchema!.options.map((x,j)=>j===i?{...x,label:e.target.value}:x)}})}/></label>{draft.answerSchema?.kind==='numeric'&&o.id!=='o0'&&<><label>이상<Input type="number" value={o.min??0} onChange={e=>setDraft({...draft,answerSchema:{...draft.answerSchema!,options:draft.answerSchema!.options.map((x,j)=>j===i?{...x,min:Number(e.target.value)}:x)}})}/></label><label>미만 (비우면 상한 없음)<Input type="number" value={o.max??''} onChange={e=>setDraft({...draft,answerSchema:{...draft.answerSchema!,options:draft.answerSchema!.options.map((x,j)=>j===i?{...x,max:e.target.value===''?null:Number(e.target.value)}:x)}})}/></label></>}</div>)}<div className="actions"><Button type="button" variant="outline" disabled={draft.answerSchema.options.length>=9} onClick={()=>{const a=draft.answerSchema!;const regular=a.options.filter(o=>o.id!=='o0');const last=regular[regular.length-1];const id='o'+(Math.max(...a.options.map(o=>Number(o.id.slice(1))))+1);setDraft({...draft,answerSchema:{...a,options:a.kind==='numeric'?[...regular.slice(0,-1),{...last,max:(last.min??0)+10000},{id,label:'새 구간',min:(last.min??0)+10000,max:null},...a.options.filter(o=>o.id==='o0')]:[...a.options,{id,label:'새 항목'}]}})}}>분류 추가</Button><Button type="button" variant="outline" disabled={draft.answerSchema.options.length<=3} onClick={()=>{const a=draft.answerSchema!,regular=a.options.filter(o=>o.id!=='o0');regular.pop();if(a.kind==='numeric')regular[regular.length-1]={...regular[regular.length-1],max:null};setDraft({...draft,answerSchema:{...a,options:[...regular,...a.options.filter(o=>o.id==='o0')]}})}}>마지막 분류 제거</Button></div><p className="small muted">수치 구간은 하한 포함·상한 제외입니다. 구간 경계가 연속이어야 하며 마지막 구간에는 상한을 두지 않습니다.</p></>}
    <label>판단에 사용할 사실·참여자의 주장·가정·미확인 정보<textarea rows={7} maxLength={6011} value={(draft.facts??[]).join('\n')} onChange={e=>setDraft({...draft,facts:e.target.value.split('\n').filter(Boolean)})}/></label><p className="small muted">한 줄에 한 항목, 최대12개·각500자. 금액형이면 비용·단위·인원 등을, 찬반형이면 판단 대상과 논거를 정리하세요. 미확인 내용을 사실처럼 적지 마세요. 아래 원문에서 확인한 내용을 여기에 반영하면 의견 입력에 사용됩니다.</p></fieldset>
    <fieldset disabled={readOnly || busy} className="document-fields stack">
      <label>대화 핵심 요약<textarea className="document-textarea" rows={6} required maxLength={2000} value={draft.summary??''} onChange={event=>setDraft({...draft,summary:event.target.value})}/></label>
      <label>핵심 질문<Input required maxLength={300} value={draft.question} onChange={event => setDraft({ ...draft, question: event.target.value })}/></label>
      <label>판단 기준<Input required maxLength={300} value={draft.proposition} onChange={event => setDraft({ ...draft, proposition: event.target.value })}/></label>
      <label>대화 맥락<textarea className="document-textarea" rows={3} required maxLength={800} value={draft.context} onChange={event => setDraft({ ...draft, context: event.target.value })}/></label>
      <label>핵심 쟁점<textarea className="document-textarea" rows={3} maxLength={3005} value={draft.keyIssues.join('\n')} onChange={event => setDraft({ ...draft, keyIssues: event.target.value.split('\n') })}/></label>
      <div className="document-logic-grid"><label className="logic-for">첫 관점·대안의 예상 논거<textarea className="document-textarea" rows={4} maxLength={3005} placeholder="한 줄에 하나의 논리를 적어 주세요." value={draft.supportingLogic.join('\n')} onChange={event => setDraft({ ...draft, supportingLogic: event.target.value.split('\n') })}/></label>
        <label className="logic-against">다른 관점·대안의 예상 논거<textarea className="document-textarea" rows={4} maxLength={3005} placeholder="한 줄에 하나의 논리를 적어 주세요." value={draft.opposingLogic.join('\n')} onChange={event => setDraft({ ...draft, opposingLogic: event.target.value.split('\n') })}/></label></div>
    </fieldset><p className="small muted">예상 논리는 AI가 제안한 검토용 내용입니다. 실제 참여자의 발언으로 해석하지 마세요. 항목은 한 줄에 하나씩 최대 6개입니다.</p>
    <section className="document-sources stack"><div className="document-source-heading"><div><h3>누가 어떤 말을 했나요?</h3><p className="small muted">요약이 원문과 맞는지 확인하는 근거입니다. 의견 모델에는 원문을 보내지 않습니다.</p></div><label>발언자별 보기<select value={speaker} onChange={event => setSpeaker(event.target.value)}><option value="all">전체 발언자</option>{people.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label></div>
      {sources.map(source => <article className={`document-source ${draft.evidenceMessageIds.includes(source.messageId) ? 'included' : ''}`} key={source.messageId}><div className="document-source-select"><strong>{source.speaker}</strong><span className="small muted">사실·비용 확인용 원문</span></div><blockquote>{source.text}</blockquote><Button asChild variant="link"><Link href={conversationHref(job.conversationId, 'messages', source.messageId)}>원문 확인</Link></Button></article>)}
      {!sources.length && <Empty title="표시할 발언 근거가 없습니다">참여자 조건이나 원문을 확인하고 문서 내용을 검토해 주세요.</Empty>}
    </section>
    {readOnly&&!original.markdown&&<Notice>이전 기록을 현재 형식으로 조합해 표시합니다. 당시 모델에는 항목별 데이터가 전달됐습니다.</Notice>}
    <FinalDocumentPanel value={composition.markdown} candidate={composition.candidate} pending={composition.pending} error={composition.error} manual={!!draft.markdownEdited} readOnly={readOnly} disabled={busy} onEdit={markdown=>{setDraft({...draft,markdown,markdownEdited:true});setResearchReviewed(true);}} onRebuild={()=>{setDraft({...draft,markdown:composition.candidate,markdownEdited:false});setResearchReviewed(true);}}/>
    {original.researchUpdated&&!readOnly&&<label className="final-document-ack"><input type="checkbox" checked={researchReviewed} onChange={e=>setResearchReviewed(e.target.checked)}/>새 조사 결과를 최종 문서에 반영했거나, 현재 편집본을 그대로 사용할지 확인했습니다.</label>}
    {error && <Notice tone="error">{error}</Notice>}
    {starting&&<AiProgress active title="의견 분석 시작 준비 중" description="확인한 최종 마크다운 문서를 저장하고 그 문서로 페르소나 의견 작업을 시작합니다."/>}
    {!readOnly && <div className="document-footer"><span className="small muted"><Check size={14}/>{draft.evidenceMessageIds.length}개 원문 근거 · 최종 문서 그대로 전달</span><div className="actions"><Button type="button" variant="outline" disabled={busy || composition.pending || !!composition.error || !dirty} onClick={() => void saveAndRun(false)}><Save size={15}/>{busy ? '처리 중…' : '문서 저장'}</Button><Button type="button" disabled={busy || composition.pending || !!composition.error || !researchReviewed} onClick={() => void saveAndRun(true)}>최종 문서 확정·의견 요청<ArrowRight size={16}/></Button></div></div>}
  </Card>;
}
