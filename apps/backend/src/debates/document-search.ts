import type { ChatMessage } from '../conversations/conversation.types';
export function documentKeywords(input:string){
 const stop=new Set(['얼마','얼마나','적당','적절','어떻게','어떤','무엇','누가','왜','대한','대해','관련','사람','생각','의견','판단','질문','현재','이것','그것','우리','해야','할까','있을까','좋을까','맞을까','것인가']);
 return [...new Set((input.toLowerCase().match(/[가-힣a-z0-9]+/g)??[]).map(w=>w.replace(/(에게는|에게|에서는|에서|으로|까지|부터|이랑|이라면|하면|은|는|을|를|이|가|에|의)$/,'')).filter(w=>w.length>=2||['술','돈','법'].includes(w)).filter(w=>!stop.has(w)&&!/(까요|나요|할까|일까|인가|한가|줘야|사온|적당|적절)/.test(w)))].slice(0,6);
}
/** 단어 일치만으로 후보를 고르고, 긴 발언은 해당 단어 주변 원문 조각만 유지한다. */
export function selectExcerpts(rows:ChatMessage[],keywords:string[],speakerIds:string[]){
 const unique=[...new Map(rows.filter(m=>m.kind==='text'&&(!speakerIds.length||speakerIds.includes(m.participantId??''))).map(m=>[m.id,m])).values()];
 const ranked=unique.map(m=>({m,score:keywords.filter(k=>m.text.toLowerCase().includes(k)).length})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||(a.m.sequence??0)-(b.m.sequence??0));
 let bytes=0;const chosen:ChatMessage[]=[];
 for(const {m} of ranked){const lower=m.text.toLowerCase();const pos=Math.min(...keywords.map(k=>lower.indexOf(k)).filter(i=>i>=0));const start=Math.max(0,pos-180);const text=m.text.slice(start,start+650);const size=Buffer.byteLength(text)+200;if(chosen.length>=16||bytes+size>6000)continue;chosen.push({...m,text});bytes+=size;}
 return {messages:chosen.sort((a,b)=>(a.sequence??0)-(b.sequence??0)),matched:ranked.length};
}
