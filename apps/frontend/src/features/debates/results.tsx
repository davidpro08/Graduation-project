import { MarkdownPreview } from './final-document';
import { useState } from 'react';
import Link from 'next/link';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, Empty, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { authenticatedRequest } from '@/lib/api';
import { conversationHref } from '@/lib/navigation';
import { useQueryResult, useReducedMotion } from '@/features/conversations/hooks';
import { colors, dimensions, dimensionLabels, dimensionValue, optionLabel, percent, type Facets, type Filters, type Job, type Result } from './types';
import { PersonaFilterPanel } from './filters';
import { RegionMap } from './region-map';
import { displayName, stancePresentation } from './presentation';

export function DebateResults({ job, conversationId }: { job: Job; conversationId: string }) {
  const [filters, setFilters] = useState<Filters>({});

  const [personPage, setPersonPage] = useState(0);
  const reduced = useReducedMotion();
  const result = useQueryResult(JSON.stringify([job.id, filters]), signal => authenticatedRequest<Result>(`/persona-debates/${job.id}/result`, { method: 'POST', json: { filters }, signal }));
  const saved = job.result!;
  const options = Object.fromEntries(dimensions.map(key => [key, [...new Set(saved.responses.map(row => dimensionValue(row.persona, key)))].sort()])) as Facets;
  const change = (next: Filters) => { setFilters(next); setPersonPage(0); };
  const data = result.data;
  const visible = data?.responses.filter(row => row.mode === 'detail' && dimensions.every(key => !filters[key]?.length || filters[key]!.includes(dimensionValue(row.persona, key)))) ?? [];
  const nameFor = (id: string) => { const person = saved.responses.find(row => row.persona.id === id)?.persona; return person ? displayName(person) : '응답자'; };
  const statistics = data?.statistics;

  return <>
    <Card title="정리된 논쟁"><h3>{saved.topic.question}</h3><p><strong>판단 기준:</strong> {saved.topic.proposition}</p>{saved.topic.documentFormat==='markdown'?<details><summary>분석에 전달한 최종 문서</summary><MarkdownPreview text={saved.topic.context}/></details>:<p className="muted">{saved.topic.context}</p>}
      <div className="actions">{saved.topic.evidenceMessageIds.map((id, index) => <Button key={id} asChild variant="link"><Link href={conversationHref(conversationId, 'messages', id)}>근거 {index + 1}</Link></Button>)}</div>
      <p className="small muted">선택 조건에 해당하는 {saved.eligible.toLocaleString()}명 중 {saved.selected}명 · 상세 {saved.detailTarget}명 / JEV {saved.jevTarget}명</p>
    </Card>
    <Card><PersonaFilterPanel title="결과 내 필터" options={options} value={filters} onChange={change}/><p className="small muted">저장된 응답을 다시 집계합니다.</p></Card>
    {result.loading ? <Card><p role="status">선택 조건으로 결과를 집계하고 있습니다…</p></Card> : result.error ? <Card><Notice tone="error">{result.error}</Notice><Button onClick={result.retry}>다시 조회</Button></Card> : data && statistics ? <>
      <Card title="전체 의견 분포">
        <p className="muted">응답 {statistics.answered}명 / 선택 {statistics.selected}명 · 실패 {statistics.failed}명 · 상세 {statistics.detailAnswered}명 / JEV {statistics.jevAnswered}명</p>
        {statistics.failed > 0 && <Notice tone="warning">실패한 응답은 비율 계산에서 제외했습니다. 필터별 응답 수를 함께 확인하세요.</Notice>}
        {statistics.answered ? <div className="debate-distribution"><div className="debate-pie" aria-label="의견 분포 원형 그래프">
          <ResponsiveContainer width="100%" height={260}><PieChart><Pie data={statistics.distribution} dataKey="count" nameKey="label" innerRadius={65} outerRadius={100} isAnimationActive={!reduced}>
            {statistics.distribution.map((item, index) => <Cell key={item.label} fill={colors[index]}/>)}</Pie><Tooltip/></PieChart></ResponsiveContainer>
        </div><table><caption>완료된 응답을 동일 가중치로 계산한 의견 비율</caption><thead><tr><th>의견</th><th>응답 수</th><th>비율</th></tr></thead><tbody>{statistics.distribution.map((item, index) => <tr key={item.label}><th><span className="stance-dot" style={{ backgroundColor: colors[index] }}/>{item.label}</th><td>{item.count}명</td><td>{percent(item.count / statistics.answered)}</td></tr>)}</tbody></table></div> : <Empty title="조건에 맞는 완료 응답이 없습니다">결과 조건을 줄이거나 응답 실패 여부를 확인하세요.</Empty>}
      </Card>
      {!saved.topic.answerSchema&&<Card title="동의도 스펙트럼">
        <p>JEV 점수 가중 평균 입장: <strong>{statistics.jevAgreement === null ? '집계 불가' : statistics.jevAgreement.toFixed(2)}</strong> · 평균 {statistics.jevScoreKind === 'conditional_option_probability' ? '선택 확률' : statistics.jevScoreKind === 'mixed' ? '가중 점수' : '자기평가 신뢰도'} {percent(statistics.jevConfidence)}</p>
        <p className="small muted">동의도 −1은 강한 반대, 0은 중립, +1은 강한 찬성입니다. {statistics.jevScoreKind === 'conditional_option_probability' ? 'JEV-CPU 점수는 주어진 다섯 선택지 안의 조건부 확률입니다.' : statistics.jevScoreKind === 'mixed' ? '서로 다른 종류의 JEV 점수가 함께 집계되어 있습니다.' : '신뢰도는 모델의 자기평가입니다.'} 정확도나 통계적 신뢰구간을 의미하지 않습니다.</p>
        {statistics.spectrum.length > 0 && <><div className="spectrum-cloud" role="group" aria-label="상세 응답 전체의 동의도 스펙트럼">
          {statistics.jevAgreement !== null && <span className="spectrum-average" style={{ left: `${(statistics.jevAgreement + 1) * 50}%` }} title={`JEV 가중 평균 ${statistics.jevAgreement.toFixed(2)}`}/>}
          {statistics.spectrum.map((row, index) => <a key={row.personaId} className="spectrum-point" href={`#persona-${row.personaId}`} title={`${nameFor(row.personaId)} · 동의도 ${row.agreement.toFixed(2)} · 일치도 ${percent(row.alignment)}`}
            aria-label={`${nameFor(row.personaId)} 동의도 ${row.agreement.toFixed(2)}`}
            style={{ left: `${(row.agreement + 1) * 50}%`, top: `${18 + index % 6 * 16}px` }}
            onClick={() => setPersonPage(Math.floor(visible.findIndex(item => item.persona.id === row.personaId) / 10))}/>)}</div>
          <div className="spectrum-labels small muted"><span>−1 강한 반대</span><span>0 중립</span><span>+1 강한 찬성</span></div><p className="small muted">점: 상세 응답 · 세로선: JEV 가중 평균 · 점을 누르면 개별 응답으로 이동합니다.</p></>}
        {!statistics.spectrum.length && <Empty title="상세 응답이 없습니다"/>}
        {statistics.spectrum.length > 0 && <details><summary>상세 응답별 동의도·일치도 수치</summary><div className="table-scroll"><table><caption>상세 응답과 JEV 입장 분포의 비교</caption><thead><tr><th>이름</th><th>입장 위치 (반대 → 찬성)</th><th>JEV 분포 일치도</th></tr></thead><tbody>{statistics.spectrum.map(row => <tr key={row.personaId}><th><a href={`#persona-${row.personaId}`} onClick={() => setPersonPage(Math.floor(visible.findIndex(item => item.persona.id === row.personaId) / 10))}>{nameFor(row.personaId)}</a></th><td><div className="agreement-track" role="img" aria-label={`동의도 ${row.agreement.toFixed(2)}`}><span style={{ left: `${(row.agreement + 1) * 50}%` }}/></div><span className="small">{row.agreement.toFixed(2)} · 신뢰도 {percent(row.confidence)}</span></td><td>{percent(row.alignment)}</td></tr>)}</tbody></table></div></details>}
        <details><summary>일치도 계산 기준</summary><p className="small muted">각 JEV 응답과 상세 응답의 입장 좌표 차이를 0~1의 유사도로 바꾸고 JEV 점수로 가중 평균합니다. 계산식: Σ[점수 × (1 − |상세 동의도 − JEV 동의도| / 2)] / Σ점수. JEV-CPU 점수는 승리 선택지의 조건부 확률이며, 점수 합이 0이거나 JEV 응답이 없으면 집계 불가입니다. 문장 자체의 의미적 동의 여부를 측정한 값은 아닙니다.</p></details>
      </Card>}
      {statistics.numericSummary&&<Card title="상세 응답의 제안 금액"><p>평균 {statistics.numericSummary.mean.toLocaleString()} {saved.topic.answerSchema?.unit} · 중앙값 {statistics.numericSummary.median.toLocaleString()} {saved.topic.answerSchema?.unit}</p><p className="small muted">정확한 수치를 제시한 상세 응답 {statistics.numericSummary.count}명만 계산했습니다. JEV 구간 선택과 판단 보류는 포함하지 않습니다.</p></Card>}
      <Card title="인구 통계별 분석"><p className="small muted">각 막대는 범주 내 완료 응답 비율입니다. 적은 표본의 차이를 전체 인구 차이로 해석하지 마세요.</p><div className="demographic-grid">{dimensions.map(key=>{
        const chart=<section className="demographic-chart"><h3>{dimensionLabels[key]} {saved.filters[key]?.length?'· 분석 조건 사용':''}</h3>{key==='province'&&<RegionMap options={options.province} selected={filters.province??[]} onChange={province=>change({...filters,province,district:[]})}/>}<div className="demographic-groups">{statistics.demographics[key].map(g=><div key={g.value}><div className="demographic-label"><strong>{optionLabel(key,g.value)}</strong><span>{g.answered}/{g.selected}명</span></div><div className="demographic-bar" role="img" aria-label={statistics.distribution.map((d,i)=>`${d.label} ${g.counts[i]}명`).join(', ')}>{g.counts.map((n,i)=><span key={i} title={`${statistics.distribution[i].label}: ${n}명`} style={{width:`${g.answered?n/g.answered*100:0}%`,backgroundColor:colors[i%colors.length]}}/>)}</div></div>)}</div><div className="chart-legend">{statistics.distribution.map((d,i)=><span key={d.label}><i style={{backgroundColor:colors[i%colors.length]}}/>{d.label}</span>)}</div></section>;
        return ['ageGroup','sex','province','education'].includes(key)?<div key={key}>{chart}</div>:<details key={key} open={saved.filters[key]?.length?true:undefined}><summary>{dimensionLabels[key]}별 분포{saved.filters[key]?.length?' · 분석 조건 사용':''}</summary>{chart}</details>;
      })}</div></Card>
      <Card title={`개별 상세 응답 · ${visible.length}명`}>
        <p className="muted">이 분석의 상세 응답 {saved.detailTarget}명의 특성과 의견·답변을 표시합니다. JEV 간단 의견은 위 통계에 포함됩니다.</p>
        <p className="small muted">합성 페르소나의 이름과 특성입니다. 새 분석에는 원본 데이터 본문의 이름을 사용합니다.</p>
        {visible.slice(personPage * 10, (personPage + 1) * 10).map(row => <article className="persona-response stack" id={`persona-${row.persona.id}`} key={row.persona.id} tabIndex={-1}>
          <div className="response-identity"><div className="response-avatar" aria-hidden="true">{displayName(row.persona).slice(-2)}</div><div className="response-profile"><div className="response-name"><h3>{displayName(row.persona)}</h3><span className="opinion-badge" title={row.opinion?.opinion} style={{ color: (saved.topic.answerSchema?{color:colors[Math.max(0,saved.topic.answerSchema.options.findIndex(o=>o.id===row.opinion?.optionId))%colors.length],label:row.opinion?.numericValue!=null?`${row.opinion.numericValue.toLocaleString()} ${saved.topic.answerSchema.unit}`:row.opinion?.opinion??'응답 실패'}:stancePresentation(row.opinion?.agreement)).color, backgroundColor: `${(saved.topic.answerSchema?{color:colors[Math.max(0,saved.topic.answerSchema.options.findIndex(o=>o.id===row.opinion?.optionId))%colors.length],label:row.opinion?.numericValue!=null?`${row.opinion.numericValue.toLocaleString()} ${saved.topic.answerSchema.unit}`:row.opinion?.opinion??'응답 실패'}:stancePresentation(row.opinion?.agreement)).color}15` }}><span style={{ backgroundColor: (saved.topic.answerSchema?{color:colors[Math.max(0,saved.topic.answerSchema.options.findIndex(o=>o.id===row.opinion?.optionId))%colors.length],label:row.opinion?.numericValue!=null?`${row.opinion.numericValue.toLocaleString()} ${saved.topic.answerSchema.unit}`:row.opinion?.opinion??'응답 실패'}:stancePresentation(row.opinion?.agreement)).color }}/>{(saved.topic.answerSchema?{color:colors[Math.max(0,saved.topic.answerSchema.options.findIndex(o=>o.id===row.opinion?.optionId))%colors.length],label:row.opinion?.numericValue!=null?`${row.opinion.numericValue.toLocaleString()} ${saved.topic.answerSchema.unit}`:row.opinion?.opinion??'응답 실패'}:stancePresentation(row.opinion?.agreement)).label}</span></div><p className="small muted">{row.persona.age}세 · {row.persona.sex} · {optionLabel('province', row.persona.province)} · {row.persona.education} · {row.persona.occupation}{row.persona.maritalStatus && ` · ${row.persona.maritalStatus}`}{row.persona.familyType && ` · ${row.persona.familyType}`}</p></div></div>
          {row.status === 'completed' && row.opinion ? <><p className="message-text response-answer">{row.opinion.answer}</p><p className="small muted">{row.opinion.personaBasis&&`판단에 반영한 특성: ${row.opinion.personaBasis}`} · {row.model}</p></> : <Notice tone="warning">이 응답을 생성하지 못했습니다. {row.errorCode === 'AI_CONTEXT_ERROR' ? '모델 컨텍스트 한도를 초과했습니다.' : '유효한 응답 형식을 받지 못했습니다.'}</Notice>}
        </article>)}
        {!visible.length && <Empty title="조건에 맞는 상세 응답이 없습니다"/>}
        {visible.length > 10 && <div className="actions"><Button variant="outline" disabled={!personPage} onClick={() => setPersonPage(personPage - 1)}>이전 응답</Button><span>{personPage + 1} / {Math.ceil(visible.length / 10)}</span><Button variant="outline" disabled={(personPage + 1) * 10 >= visible.length} onClick={() => setPersonPage(personPage + 1)}>다음 응답</Button></div>}
      </Card>
    </> : null}
  </>;
}

