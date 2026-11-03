import type { DebateTopic } from './debate.types';

/** 의견 모델에는 편집된 요약·쟁점만 전달하고 원문 발언과 근거 ID는 보내지 않는다. */
export function opinionContext(topic: DebateTopic,forModel=false): DebateTopic {
  if(topic.markdown?.trim()||topic.documentFormat==='markdown')return {
    question:forModel?'context의 최종 문서에 명시된 질문에 답하세요.':topic.question,proposition:'최종 문서에 명시된 질문과 판단 기준을 따르세요.',
    context:topic.markdown??topic.context,documentFormat:'markdown',answerSchema:topic.answerSchema,evidenceMessageIds:[],
  };
  return { decisionGoal:topic.decisionGoal,constraints:topic.constraints,assumptions:topic.assumptions,research:topic.research?{...topic.research,queries:[],sources:topic.research.sources.map(s=>({...s,content:''}))}:undefined,answerSchema:topic.answerSchema, facts:topic.facts, summary: topic.summary ?? topic.context, question: topic.question, proposition: topic.proposition, context: topic.context,
    keyIssues: topic.keyIssues ?? [], supportingLogic: topic.supportingLogic ?? [], opposingLogic: topic.opposingLogic ?? [], evidenceMessageIds: [] };
}
