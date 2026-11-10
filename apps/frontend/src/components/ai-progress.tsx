'use client';
import { useEffect, useId, useState } from 'react';
import { CheckCircle2, LoaderCircle, Sparkles } from 'lucide-react';

interface Props { active:boolean; done?:boolean; title:string; description:string; completed?:number; total?:number }

/** 서버 처리 수가 있으면 실제 비율, 없으면 95% 미만의 대기 기반 표시를 사용한다. */
export function AiProgress({active,done=false,title,description,completed,total}:Props){
  const [elapsed,setElapsed]=useState(0),descriptionId=useId();
  useEffect(()=>{
    if(!active)return;
    const start=Date.now();setElapsed(0);
    const timer=setInterval(()=>setElapsed((Date.now()-start)/1000),1000);
    return()=>clearInterval(timer);
  },[active]);
  const actual=typeof total==='number'&&total>0&&typeof completed==='number';
  const value=done?100:actual?Math.min(99,Math.max(0,Math.round(completed/total*100))):Math.min(95,Math.floor(5+90*(1-Math.exp(-elapsed/90))));
  if(!active&&!done)return null;
  return <section className={`ai-progress${done?' is-done':''}`} data-progress-mode={done?'complete':actual?'actual':'estimated'}>
    <div className="ai-progress-heading"><div className="ai-progress-title">{done?<CheckCircle2 size={20} aria-hidden="true"/>:<Sparkles size={20} aria-hidden="true"/>}<strong>{title}</strong></div><span className="ai-progress-value" aria-hidden="true">{value}%</span></div>
    <div className="ai-progress-track" role="progressbar" aria-label={title} aria-describedby={descriptionId} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={done?'처리 완료':actual?`전체 ${total}명 중 ${completed}명 처리`:`가상 진행률 ${value}%`}><span className="ai-progress-fill" style={{width:`${value}%`}}/></div>
    <p id={descriptionId} className="ai-progress-description" role="status">{!done&&<LoaderCircle className="ai-progress-spinner" size={14} aria-hidden="true"/>}{description}</p>
    {!done&&<p className="ai-progress-note">{actual?`전체 ${completed?.toLocaleString()} / ${total?.toLocaleString()}명 처리 · 결과 저장 후 완료됩니다.`:'가상 진행률입니다. 실제 완료율과 다를 수 있으며, 처리가 끝나면 완료로 전환됩니다.'}</p>}
  </section>;
}
