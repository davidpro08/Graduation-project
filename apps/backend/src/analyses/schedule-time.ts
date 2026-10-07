export interface TimeSuggestion {date:string|null;time:string|null;endTime:string|null;referenceDate:string;referenceTime:string;warnings:string[]}
const CLOCK=/(오전|오후|아침|저녁|밤|낮)?\s*(\d{1,2})\s*(?:시\s*(?:(반)|(\d{1,2})\s*분?)?|:(\d{2}))/g;
const pad=(n:number)=>String(n).padStart(2,'0');
const dateText=(date:Date)=>date.toISOString().slice(0,10);
const validDate=(year:number,month:number,day:number)=>{
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day?date:null;
};
export function hasDateExpression(text:string){return /오늘|내일|모레|글피|[이번다음지난금차]+\s*주|[월화수목금토일]요일|\d{1,2}\s*(?:월|일)|\d{1,2}\s*[/.-]\s*\d{1,2}/.test(text);}
export function suggestTime(text:string,referenceDate:string,referenceTime:string):TimeSuggestion{
  const result:TimeSuggestion={date:null,time:null,endTime:null,referenceDate,referenceTime,warnings:[]};
  const reference=new Date(`${referenceDate}T00:00:00Z`);
  if(!Number.isFinite(reference.getTime())){result.warnings.push('일정이 언급된 메시지의 날짜를 확인하지 못했습니다.');return result;}
  const clocks=[...text.matchAll(CLOCK)];let period:string|undefined;
  for(const [index,clock] of clocks.slice(0,2).entries()){
    if(index===1&&!/[~～–—-]|부터/.test(text.slice((clocks[0].index??0)+clocks[0][0].length,clock.index))){result.warnings.push('시간 표현이 여러 개라 종료 시간을 자동 선택하지 않았습니다.');break;}
    period=clock[1]||period;
    let hour=Number(clock[2]);const minute=clock[3]?30:Number(clock[4]??clock[5]??0);
    if(hour>23||minute>59)continue;
    if(period){if(hour<1||hour>12)continue;hour=hour%12+(/오후|저녁|밤|낮/.test(period)?12:0);}
    else if(hour>=1&&hour<=12){hour=hour%12+12;if(!result.warnings.includes('오전·오후가 없어 오후로 제안했습니다. 원문을 확인해 주세요.'))result.warnings.push('오전·오후가 없어 오후로 제안했습니다. 원문을 확인해 주세요.');}
    const value=`${pad(hour)}:${pad(minute)}`;if(index===0)result.time=value;else result.endTime=value;
  }
  if(result.endTime&&result.time&&result.endTime<=result.time){result.endTime=null;result.warnings.push('종료 시간이 시작 시간보다 이릅니다. 날짜를 넘기는 일정인지 확인해 주세요.');}
  let date:Date|null=null;
  let roll:'week'|'month'|null=null;
  const full=text.match(/(\d{4})\s*(?:년\s*|[./-])(\d{1,2})\s*(?:월\s*|[./-])(\d{1,2})\s*일?/);
  const monthDay=text.match(/(?<!\d)(\d{1,2})\s*(?:월\s*|\/)(\d{1,2})\s*일?/);
  const day=text.match(/(?<!\d)(\d{1,2})\s*일(?!요일)/);
  const weekday=text.match(/([월화수목금토일])요일/);
  if(full)date=validDate(Number(full[1]),Number(full[2]),Number(full[3]));
  else if(monthDay)date=validDate(reference.getUTCFullYear(),Number(monthDay[1]),Number(monthDay[2]));
  else if(/모레|내일|오늘|글피/.test(text)){
    date=new Date(reference);date.setUTCDate(date.getUTCDate()+(/글피/.test(text)?3:/모레/.test(text)?2:/내일/.test(text)?1:0));
  }else if(day){
    const monthOffset=/다음\s*달/.test(text)?1:/지난\s*달/.test(text)?-1:0;
    const month=new Date(Date.UTC(reference.getUTCFullYear(),reference.getUTCMonth()+monthOffset,1));
    date=validDate(month.getUTCFullYear(),month.getUTCMonth()+1,Number(day[1]));
    if(!/다음\s*달|지난\s*달/.test(text))roll='month';
  }else if(weekday){
    const weekOffset=/다다음\s*주/.test(text)?14:/다음\s*주/.test(text)?7:/지난\s*주/.test(text)?-7:0;
    const mondayOffset=(reference.getUTCDay()+6)%7;
    date=new Date(reference);date.setUTCDate(date.getUTCDate()-mondayOffset+'월화수목금토일'.indexOf(weekday[1])+weekOffset);
    if(weekOffset===0)roll='week';
  }
  if(date&&roll){
    const proposed=dateText(date);const passed=proposed<referenceDate||(proposed===referenceDate&&result.time!==null&&result.time<=referenceTime);
    if(passed){
      if(roll==='week'){date.setUTCDate(date.getUTCDate()+7);result.warnings.push('메시지가 작성된 시점에 지난 요일·시간이어서 다음 주로 제안했습니다.');}
      else{const next=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,1));date=validDate(next.getUTCFullYear(),next.getUTCMonth()+1,date.getUTCDate());result.warnings.push('메시지가 작성된 시점에 지난 날짜·시간이어서 다음 달로 제안했습니다.');}
    }
  }
  if(date)result.date=dateText(date);else result.warnings.push('날짜를 확정할 근거가 부족하거나 날짜가 유효하지 않습니다. 직접 선택해 주세요.');
  if(!result.time)result.warnings.push('시간을 확인하지 못했습니다. 직접 선택해 주세요.');
  if(/매주|매달|매월/.test(text))result.warnings.push('반복 일정 표현입니다. 첫 일정만 제안하며 반복 주기는 자동 저장하지 않습니다.');
  return result;
}
