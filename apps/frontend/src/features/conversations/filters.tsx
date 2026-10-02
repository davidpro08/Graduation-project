import { useId, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { CSSProperties } from 'react';
import type { ChatFilter, Participant } from './types';

export function participantStyle(index:number):CSSProperties {
  return {'--participant-bg-hue':`${index%20*18}`, '--participant-fg-hue':`${Math.floor(index/20)%20*18}`} as CSSProperties;
}
export function ParticipantAvatar({participant}:{participant:Participant}) {
  return <Avatar className="participant-avatar" style={participantStyle(participant.colorIndex)} title={participant.name}>
    <AvatarFallback className="participant-avatar-fallback"><span>{Array.from(participant.name).slice(0,2).join('')}</span></AvatarFallback>
  </Avatar>;
}
function DatePicker({label,value,onChange,min,max}:{label:string;value?:string;onChange:(value:string)=>void;min?:string;max?:string}) {
  const [open,setOpen]=useState(false);const id=useId();
  return <div className="field"><span id={id} className="field-label">{label}</span><Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" className="date-trigger" aria-labelledby={id}><CalendarDays size={18}/>{value?format(parseISO(value),'yyyy.MM.dd'):'전체 기간'}</Button></PopoverTrigger>
    <PopoverContent align="start" className="date-popover w-auto p-0"><Calendar mode="single" locale={ko} selected={value?parseISO(value):undefined}
      defaultMonth={parseISO(value || min || max || format(new Date(),'yyyy-MM-dd'))} captionLayout="dropdown" startMonth={min?parseISO(min):undefined} endMonth={max?parseISO(max):undefined}
      disabled={[...(min?[{before:parseISO(min)}]:[]),...(max?[{after:parseISO(max)}]:[])]}
      onSelect={date=>{onChange(date?format(date,'yyyy-MM-dd'):'');setOpen(false);}}/>
      <Button variant="ghost" className="w-full" onClick={()=>{onChange('');setOpen(false);}}>날짜 조건 해제</Button></PopoverContent>
  </Popover></div>;
}
export function QueryFilters({filter,onChange,participants,startDate,endDate}:{filter:ChatFilter;onChange:(filter:ChatFilter)=>void;participants:Participant[];startDate:string;endDate:string}) {
  const id=useId();
  return <div className="query-fields">
    <DatePicker label="시작일" value={filter.from} min={startDate} max={filter.to || endDate} onChange={from=>onChange({...filter,from,page:1})}/>
    <DatePicker label="종료일" value={filter.to} min={filter.from || startDate} max={endDate} onChange={to=>onChange({...filter,to,page:1})}/>
    <div className="field"><span className="field-label" id={id}>참여자</span><Select value={filter.participantId || 'all'} onValueChange={value=>onChange({...filter,participantId:value==='all'?undefined:value,page:1})}>
      <SelectTrigger aria-labelledby={id} className="min-h-12"><SelectValue placeholder="전체 참여자"/></SelectTrigger>
      <SelectContent className="select-panel"><SelectItem value="all">전체 참여자</SelectItem>{participants.map(p=><SelectItem key={p.id} value={p.id}><span className="participant-option" style={participantStyle(p.colorIndex)}><span className="participant-dot"/>{p.name}</span></SelectItem>)}</SelectContent>
    </Select></div>
    <Button variant="outline" onClick={()=>onChange({page:1})}>조건 초기화</Button>
  </div>;
}
export function PageControls({page,total,pageSize,onChange,disabled=false}:{page:number;total:number;pageSize:number;onChange:(page:number)=>void;disabled?:boolean}) {
  const pages=Math.max(1,Math.ceil(total/pageSize));
  return <nav className="pagination" aria-label="페이지 이동"><Button variant="outline" size="sm" disabled={disabled || page<=1} onClick={()=>onChange(page-1)}>이전</Button>
    <span className="small" aria-live="polite">{page} / {pages} 페이지 · {total.toLocaleString()}개</span>
    <Button variant="outline" size="sm" disabled={disabled || page>=pages} onClick={()=>onChange(page+1)}>다음</Button></nav>;
}
