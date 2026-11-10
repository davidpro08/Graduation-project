import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const pad=(value:number)=>String(value).padStart(2,'0');
export function TimePicker({label,value,onChange,optional=false}:{label:string;value:string;onChange:(value:string)=>void;optional?:boolean}){
  const id=useId();const [hour,minute]=value.split(':');
  return <div className="field"><span id={id} className="field-label">{label} · 한국 시간{optional?' (선택)':''}</span>
    <div className="flex flex-wrap gap-2">
      <Select value={hour||'unset'} onValueChange={next=>onChange(next==='unset'?'':`${next}:${minute||'00'}`)}>
        <SelectTrigger className="min-h-12 min-w-32 flex-1" aria-label={`${label} 시`}><SelectValue placeholder="시 선택"/></SelectTrigger>
        <SelectContent className="select-panel"><SelectItem value="unset">시 선택</SelectItem>{Array.from({length:24},(_,index)=><SelectItem key={index} value={pad(index)}>{index<12?'오전':'오후'} {index%12||12}시</SelectItem>)}</SelectContent>
      </Select>
      <Select value={minute||'00'} disabled={!hour} onValueChange={next=>onChange(`${hour}:${next}`)}>
        <SelectTrigger className="min-h-12 min-w-24 flex-1" aria-label={`${label} 분`}><SelectValue/></SelectTrigger>
        <SelectContent className="select-panel">{Array.from({length:60},(_,index)=><SelectItem key={index} value={pad(index)}>{pad(index)}분</SelectItem>)}</SelectContent>
      </Select>
      {optional&&value&&<Button type="button" variant="ghost" onClick={()=>onChange('')}>해제</Button>}
    </div>
  </div>;
}
