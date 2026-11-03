import type { ChatMessage } from '../conversations/conversation.types';
import type { AnalysisItem } from './analysis.types';
import { hasDateExpression, suggestTime, type TimeSuggestion } from './schedule-time';

export function scheduleCandidate(item: AnalysisItem, messages: ChatMessage[]): TimeSuggestion | undefined {
  const ids = new Set(item.evidenceMessageIds);
  const evidence = messages.filter(message => ids.has(message.id));
  const source = evidence.find(message => hasDateExpression(message.text)) ?? evidence[0];
  if (!source) return undefined;
  const expression = evidence.filter(message => message.date === source.date).map(message => message.text).join('\n');
  const mentioned = item.dateTimeText ?? '';
  const result = suggestTime(hasDateExpression(mentioned) ? mentioned : expression || mentioned, source.date, source.time || '09:00');
  const warnings: string[] = [];
  if (!result.date) {
    result.date = item.date ?? source.date;
    warnings.push(item.date ? '날짜는 대화 흐름에서 AI가 추정했습니다.' : '날짜 근거가 부족해 대화가 나온 날짜로 임시 입력했습니다.');
  }
  if (!result.time) {
    result.time = item.time ?? (/아침|오전/.test(expression) ? '09:00' : /점심|정오/.test(expression) ? '12:00' : /저녁/.test(expression) ? '18:00' : /밤/.test(expression) ? '21:00' : /오후/.test(expression) ? '15:00' : source.time || '09:00');
    warnings.push(item.time ? '시간은 대화 흐름에서 AI가 추정했습니다.' : '정확한 시간이 없어 시간대 또는 발언 시각으로 임시 입력했습니다.');
  }
  if (item.uncertain) warnings.push('확정되지 않은 약속 또는 추정한 일정입니다.');
  result.warnings = [...new Set([...result.warnings.filter(warning => !warning.includes('직접 선택해 주세요.')), ...warnings])];
  result.uncertain = result.warnings.length > 0;
  return result;
}

/** 같은 일정의 일부 발언만 재추출한 후보를, 그 근거를 모두 포함한 후보로 대체한다. */
export function mergeScheduleCandidates(items: AnalysisItem[]): AnalysisItem[] {
  const normalized=(title:string|undefined)=>title?.replace(/\s/g,'')??'';
  const resolved=items.map(item=>({...item,evidenceMessageIds:[...item.evidenceMessageIds]}));
  const absorbed=new Set<number>();
  resolved.forEach((item,index)=>{
    // AI가 같은 약속의 장소 확인만 별도 일정으로 반환한 경우에 한정한다.
    const title=normalized(item.title), base=title.replace(/장소$/,'');
    const warnings=item.suggestion?.warnings??[];
    if(base===title||!warnings.some(text=>text.includes('날짜')&&text.includes('임시 입력'))||!warnings.some(text=>text.includes('시간')&&text.includes('임시 입력')))return;
    const clock=(value:string|undefined)=>{const [hour,minute]=(value??'').split(':').map(Number);return hour*60+minute;};
    const targets=resolved.map((other,otherIndex)=>({other,otherIndex})).filter(({other,otherIndex})=>{
      const difference=clock(item.suggestion?.referenceTime)-clock(other.suggestion?.referenceTime);
      return index!==otherIndex&&normalized(other.title)===base&&item.suggestion?.referenceDate===other.suggestion?.referenceDate&&difference>=0&&difference<=30;
    });
    if(targets.length===1){const target=targets[0].other;target.evidenceMessageIds=[...new Set([...target.evidenceMessageIds,...item.evidenceMessageIds])];absorbed.add(index);}
  });
  return resolved.filter((item,index) => !absorbed.has(index)&&!resolved.some((other,otherIndex) => {
    if(absorbed.has(otherIndex))return false;
    if(index===otherIndex || item.title?.replace(/\s/g,'')!==other.title?.replace(/\s/g,'') || item.suggestion?.date!==other.suggestion?.date) return false;
    const ids=new Set(item.evidenceMessageIds), otherIds=new Set(other.evidenceMessageIds);
    if(![...ids].every(id=>otherIds.has(id)))return false;
    const temporaryTime=item.suggestion?.warnings.some(warning=>warning.includes('시간')&&warning.includes('임시 입력'));
    if(item.suggestion?.time!==other.suggestion?.time&&!temporaryTime)return false;
    return otherIds.size>ids.size || (otherIds.size===ids.size&&otherIndex<index&&item.suggestion?.time===other.suggestion?.time);
  }));
}
