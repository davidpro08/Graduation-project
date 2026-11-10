import { DebateError, type AnswerSchema, type Opinion } from './debate.types';
export function validateSchema(value:unknown):AnswerSchema {
  const s=value as AnswerSchema;
  if(!s||!['stance','numeric','choice'].includes(s.kind)||typeof s.unit!=='string'||s.unit.length>30||typeof s.basis!=='string'||!s.basis.trim()||s.basis.length>500||!Array.isArray(s.options)||s.options.length<2||s.options.length>9)throw new DebateError('AI_TOPIC_STRUCTURE');
  if(s.options.some(o=>!o||!/^o[0-9]+$/.test(o.id)||typeof o.label!=='string'||!o.label.trim()||o.label.length>120)||new Set(s.options.map(o=>o.id)).size!==s.options.length)throw new DebateError('AI_TOPIC_STRUCTURE');
  if(s.kind==='numeric'){
    const bins=s.options.filter(o=>o.id!=='o0');
    if(!s.unit.trim()||s.options.filter(o=>o.id==='o0').length!==1||bins.length<1||bins.some((o,i)=>typeof o.min!=='number'||!Number.isFinite(o.min)||(o.max!==null&&(typeof o.max!=='number'||!Number.isFinite(o.max)||o.max<=o.min!))||(i>0&&bins[i-1].max!==o.min)||(o.max===null&&i!==bins.length-1))||bins[bins.length-1].max!==null)throw new DebateError('AI_TOPIC_STRUCTURE');
  }
  return {kind:s.kind,unit:s.unit,basis:s.basis,options:s.options.map(o=>({id:o.id,label:s.kind==='numeric'&&o.id!=='o0'?`${o.min!.toLocaleString()}${s.unit} 이상${o.max===null?'':` ~ ${o.max!.toLocaleString()}${s.unit} 미만`}`:o.label,...(s.kind==='numeric'&&o.id!=='o0'?{min:o.min,max:o.max}:{})}))};
}
export function validateAnswer(value:unknown,detail:boolean,s:AnswerSchema):Opinion {
  const v=value as Opinion;
  if(!v||typeof v.opinion!=='string'||!v.opinion.trim()||v.opinion.length>500||(detail&&(typeof v.answer!=='string'||!v.answer.trim()||v.answer.length>4000||typeof v.personaBasis!=='string'||!v.personaBasis.trim()||v.personaBasis.length>600)))throw new DebateError('AI_INVALID_RESPONSE');
  let option=s.options.find(o=>o.id===v.optionId);
  if(detail&&s.kind==='numeric'&&v.optionId!=='o0'){
    if(typeof v.numericValue!=='number'||!Number.isFinite(v.numericValue))throw new DebateError('AI_INVALID_RESPONSE');
    option=s.options.find(o=>o.id!=='o0'&&v.numericValue!>=o.min!&&(o.max===null||v.numericValue!<o.max!));
  }
  if(!option)throw new DebateError('AI_INVALID_RESPONSE');
  const out:Opinion={agreement:0,confidence:0,opinion:option.label,optionId:option.id,...(detail?{answer:v.answer,personaBasis:v.personaBasis,...(s.kind==='numeric'?{numericValue:option.id==='o0'?null:v.numericValue}:{})}:{})};
  if(!detail){const ps=v.optionProbabilities;if(v.scoreKind!=='conditional_option_probability'||!Array.isArray(ps)||ps.length!==s.options.length||ps.some(p=>typeof p!=='number'||!Number.isFinite(p)||p<0||p>1)||Math.abs(ps.reduce((a,b)=>a+b,0)-1)>1e-6||s.options[ps.indexOf(Math.max(...ps))].id!==option.id)throw new DebateError('JEV_INVALID_RESPONSE');out.scoreKind=v.scoreKind;out.optionProbabilities=ps;out.confidence=ps[ps.indexOf(Math.max(...ps))];}
  return out;
}
