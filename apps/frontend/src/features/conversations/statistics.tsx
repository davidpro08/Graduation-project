import { useEffect, useRef, useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';
import { MessageCircle, Moon, HelpCircle, AlignLeft, Mic } from 'lucide-react';
import { Card, Empty, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { getStatistics } from './client';
import { PageControls, ParticipantAvatar, QueryFilters } from './filters';
import { useQueryResult, useReducedMotion } from './hooks';
import type { ChatFilter, Conversation, Statistics } from './types';

const config={count:{label:'메시지',color:'var(--primary)'}};
function AnimatedNumber({value}:{value:number}) {
  const reduced=useReducedMotion();const [display,setDisplay]=useState(value);const previous=useRef(value);
  useEffect(()=>{
    if(reduced){previous.current=value;setDisplay(value);return;}
    const from=previous.current;const start=performance.now();let frame:number;
    const tick=(now:number)=>{const progress=Math.min(1,(now-start)/450);const current=Math.round(from+(value-from)*(1-Math.pow(1-progress,3)));previous.current=current;setDisplay(current);if(progress<1)frame=requestAnimationFrame(tick);};
    frame=requestAnimationFrame(tick);return ()=>cancelAnimationFrame(frame);
  },[value,reduced]);
  return <span aria-label={value.toLocaleString()}>{display.toLocaleString()}</span>;
}
type Person=Statistics['participants'][number];
const awards=[
  {title:'투머치 토커',description:'메시지를 가장 많이 보낸 사람',icon:Mic,eligible:(p:Person)=>p.count>0,score:(p:Person)=>p.count,format:(p:Person)=>`${p.count.toLocaleString()}개`},
  {title:'단답맨',description:'텍스트 10개 이상 · 5자 이하 비율이 50% 초과',icon:MessageCircle,eligible:(p:Person)=>p.textCount>=10 && p.shortCount/p.textCount>0.5,score:(p:Person)=>p.shortCount/p.textCount,format:(p:Person)=>`${Math.round(p.shortCount/p.textCount*100)}% (${p.shortCount}/${p.textCount}개)`},
  {title:'장문가',description:'텍스트 10개 이상 · 평균 글자 수가 가장 많은 사람',icon:AlignLeft,eligible:(p:Person)=>p.textCount>=10,score:(p:Person)=>p.characters/p.textCount,format:(p:Person)=>`평균 ${(p.characters/p.textCount).toFixed(1)}자`},
  {title:'야행성',description:'메시지 10개 이상 · 00–06시 발언 비율 1위',icon:Moon,eligible:(p:Person)=>p.count>=10 && p.nightCount>0,score:(p:Person)=>p.nightCount/p.count,format:(p:Person)=>`${Math.round(p.nightCount/p.count*100)}% (${p.nightCount}개)`},
  {title:'질문왕',description:'텍스트 10개 이상 · 물음표가 있는 메시지 비율 1위',icon:HelpCircle,eligible:(p:Person)=>p.textCount>=10 && p.questionCount>0,score:(p:Person)=>p.questionCount/p.textCount,format:(p:Person)=>`${Math.round(p.questionCount/p.textCount*100)}% (${p.questionCount}개)`},
];
function Awards({data}:{data:Statistics}) {
  return <div className="award-grid">{awards.map(award=>{
    const eligible=data.participants.filter(award.eligible);const max=Math.max(...eligible.map(award.score));const winners=eligible.filter(p=>Math.abs(award.score(p)-max)<1e-9);
    return <article className="award-card" key={award.title}><div className="award-heading"><award.icon size={18} aria-hidden="true"/><h3>{award.title}</h3>{winners.length>1 && <Badge variant="secondary">공동 {winners.length}명</Badge>}</div>
      <p className="small muted">{award.description}</p>{winners.length?<><div className="award-people">{winners.slice(0,3).map(p=><div className="award-person" key={p.id}><ParticipantAvatar participant={p}/><span>{p.name}</span></div>)}{winners.length>3 && <span className="small" title={winners.slice(3).map(p=>p.name).join(', ')}>외 {winners.length-3}명</span>}</div><strong className="award-score">{award.format(winners[0])}</strong></>:<p className="small muted">조건을 충족한 참여자가 없습니다.</p>}</article>;
  })}</div>;
}
export function StatisticsPage({conversation}:{conversation:Conversation}) {
  const [filter,setFilter]=useState<ChatFilter>({});const [rankingPage,setRankingPage]=useState(1);const reduced=useReducedMotion();
  const key=JSON.stringify([conversation.id,filter]);const {data,loading,error,retry}=useQueryResult(key,signal=>getStatistics(conversation.id,filter,signal));
  const update=(next:ChatFilter)=>{setFilter(next);setRankingPage(1);};
  const people=data?.participants.filter(p=>p.count>0) ?? [];const top=people.slice(0,10);
  return <div className="statistics-layout"><div className="statistics-main">
    <div className="stats-title"><div><h2>{filter.from || filter.to || filter.participantId?'조건별 통계':'전체 대화 통계'}</h2><p className="small muted">{filter.from || conversation.startDate} – {filter.to || conversation.endDate} · {filter.participantId?conversation.participants.find(p=>p.id===filter.participantId)?.name:'전체 참여자'}</p></div><Badge variant="outline">{loading?'집계 중…':'저장된 메시지 기준'}</Badge></div>
    {error && <Card><Notice tone="error">{error}</Notice><Button variant="outline" onClick={retry}>다시 조회</Button></Card>}
    {!data && loading?<><Skeleton className="h-32 w-full"/><Skeleton className="h-80 w-full"/></>:data && !error?<div className={`stack statistics-content ${loading?'is-refreshing':''}`} aria-busy={loading}>
      <div className="statistics-metrics">{[{label:'메시지',value:data.messageCount,unit:'개'},{label:'발언 참여자',value:data.participantCount,unit:'명'},{label:'텍스트 글자',value:data.characterCount,unit:'자'},{label:'평균 메시지 길이',value:Math.round(data.characterCount/Math.max(data.textCount,1)),unit:'자'}].map(metric=><Card key={metric.label}><p className="small muted">{metric.label}</p><strong className="metric"><AnimatedNumber value={metric.value}/><span>{metric.unit}</span></strong></Card>)}</div>
      {!data.messageCount?<Card><Empty title="조회 조건에 맞는 메시지가 없습니다">기간이나 참여자를 변경해 주세요.</Empty></Card>:<>
        <Card title="대화 속 캐릭터"><Awards data={data}/><p className="small muted">선택한 조건 안에서 계산한 활동 별명입니다. 성격이나 실제 답변 여부를 판단하지 않습니다.</p></Card>
        <Card title="참여자별 메시지 수" action={<span className="small muted">상위 {top.length}명</span>}><ChartContainer config={config} className="participant-chart" style={{height:Math.max(220,top.length*40)}}>
          <BarChart data={top} layout="vertical" accessibilityLayer margin={{left:0,right:30}}><CartesianGrid horizontal={false}/><XAxis type="number" allowDecimals={false}/><YAxis type="category" dataKey="name" width={90} tickLine={false} axisLine={false} tickFormatter={(name:string)=>name.length>9?`${name.slice(0,8)}…`:name}/>
            <ChartTooltip content={<ChartTooltipContent/>}/><Bar dataKey="count" radius={[0,5,5,0]} isAnimationActive={!reduced} animationDuration={450}>{top.map(p=><Cell key={p.id} fill={`hsl(${p.colorIndex%20*18} 45% 40%)`}/>)}</Bar></BarChart>
        </ChartContainer><p className="small muted">표에서 전체 참여자의 발언 수와 짧은 메시지 비율을 확인할 수 있습니다.</p></Card>
        <div className="stats-chart-grid"><Card title="날짜별 활동"><ChartContainer config={config} className="activity-chart"><AreaChart accessibilityLayer data={data.daily}><CartesianGrid vertical={false}/><XAxis dataKey="date" tickFormatter={(date:string)=>date.slice(5)} minTickGap={30}/><YAxis width={40} allowDecimals={false}/><ChartTooltip content={<ChartTooltipContent/>}/><Area type="monotone" dataKey="count" stroke="var(--primary)" fill="var(--secondary)" isAnimationActive={!reduced} animationDuration={450}/></AreaChart></ChartContainer></Card>
          <Card title="시간대별 활동"><ChartContainer config={config} className="activity-chart"><BarChart accessibilityLayer data={data.hourly}><CartesianGrid vertical={false}/><XAxis dataKey="hour" tickFormatter={(hour:number)=>`${hour}시`} interval={5}/><YAxis width={40} allowDecimals={false}/><ChartTooltip content={<ChartTooltipContent labelFormatter={value=>`${value}시`}/>}/><Bar dataKey="count" fill="var(--accent)" radius={[3,3,0,0]} isAnimationActive={!reduced} animationDuration={450}/></BarChart></ChartContainer></Card></div>
        <Card title="전체 참여자 순위"><div className="ranking-scroll"><table className="ranking-table"><thead><tr><th>참여자</th><th>메시지</th><th>발언 비중</th><th>평균 글자</th><th>5자 이하 비율</th></tr></thead><tbody>{people.slice((rankingPage-1)*20,rankingPage*20).map((p,index)=><tr key={p.id}><td><div className="ranking-name"><span className="muted">{(rankingPage-1)*20+index+1}</span><ParticipantAvatar participant={p}/><span>{p.name}</span></div></td><td>{p.count.toLocaleString()}개</td><td>{(p.count/data.messageCount*100).toFixed(1)}%</td><td>{p.textCount?`${(p.characters/p.textCount).toFixed(1)}자`:'—'}</td><td>{p.textCount?`${(p.shortCount/p.textCount*100).toFixed(1)}%`:'—'}</td></tr>)}</tbody></table></div>{people.length>20 && <PageControls page={rankingPage} total={people.length} pageSize={20} onChange={setRankingPage}/>}</Card>
      </>}
    </div>:null}
  </div><aside className="statistics-sidebar"><Card title="조회 조건"><QueryFilters filter={filter} onChange={update} participants={conversation.participants} startDate={conversation.startDate} endDate={conversation.endDate}/><p className="small muted" role="status">{loading?'조회 조건을 적용하고 있습니다.':'조건을 바꾸면 통계가 자동으로 갱신됩니다.'}</p></Card>
    <Card title="집계 기준"><p className="small muted">날짜는 양 끝을 포함합니다. 시간대는 내보내기 파일의 한국 시간 기준입니다. 입장·퇴장 시스템 메시지는 제외합니다.</p><p className="small muted">사진·파일 표시는 메시지 수에 포함하고 글자 수에는 제외합니다. 글자 수는 공백·줄바꿈을 제외한 유니코드 문자 수입니다.</p><p className="small muted">별명은 동률이면 공동으로 표시합니다. 단답맨·장문가·야행성·질문왕은 최소 10개 메시지 기준을 사용합니다.</p></Card>
  </aside></div>;
}
