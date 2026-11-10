import { validateSchema } from './answer-schema';
import { BadRequestException, Logger } from '@nestjs/common';
import { setTimeout as delay } from 'node:timers/promises';
import type { AuthUser } from '../auth/auth.types';
import type { ChatMessage } from '../conversations/conversation.types';
import type { ConversationsService } from '../conversations/conversations.service';
import { DebateError, type ResearchProvider, type DebateAi, type DebateDocument, type DebateTopic, type DocumentEdit } from './debate.types';
import { documentTemplate } from './document-template';
import { opinionContext } from './debate.context';
import { composeMarkdown, MAX_MARKDOWN_LENGTH } from './debate-markdown';
import type { DocumentResearch, PersonaFilters } from './debate.types';

export async function prepareDocument(ai: DebateAi, chats: ConversationsService, user: AuthUser, conversationId: string, input: string, speakerIds: string[], signal: AbortSignal,retryDelayMs=300,onTemplate?:(document:DebateDocument)=>Promise<void>,selectedMessages:ChatMessage[]=[],researchProvider?:ResearchProvider,seed?:DebateDocument,queries?:string[],filters:PersonaFilters={}): Promise<DebateDocument> {
  void chats;void user;void conversationId;void speakerIds;
  if(selectedMessages.length>20||new Set(selectedMessages.map(m=>m.id)).size!==selectedMessages.length)throw new BadRequestException('대화는 중복 없이 최대20개 선택할 수 있습니다.');
  const selectedMessageIds=selectedMessages.map(m=>m.id);
  const draftSignal=AbortSignal.any([signal,AbortSignal.timeout(180000)]);
  const perMessage=Math.min(1200,Math.floor(3600/Math.max(1,selectedMessages.length)));
  const messages=selectedMessages.map(m=>({...m,text:m.text.slice(0,perMessage)}));
  const template={...documentTemplate(input,messages),selectedMessageIds};
  await onTemplate?.(template);
  ai.ready?.();
  let topic:DebateTopic|null=seed?{...seed,markdown:undefined,research:undefined,facts:seed.facts?.filter(f=>!seed.research?.findings.some(old=>f===`외부 자료(${old.sourceId}): ${old.text}`)),researchQueries:queries??seed.researchQueries}:null,retries=0;
  for(let attempt=0;!topic&&attempt<2;attempt++){
    try{topic=await ai.refine(input,messages,null,draftSignal);break;}
    catch(error){Logger.warn({attempt:attempt+1,code:error instanceof DebateError?error.code:'UNKNOWN'},'DebateDocument');signal.throwIfAborted();if(draftSignal.aborted)throw new DebateError('AI_REQUEST_TIMEOUT');if(!(error instanceof DebateError)||['AI_AUTH_ERROR','AI_CONFIG_ERROR'].includes(error.code)||attempt===1)throw error;retries++;await delay(retryDelayMs,undefined,{signal:draftSignal});}
  }
  if(!topic)throw new DebateError('AI_TOPIC_STRUCTURE');
  const researchWarnings:string[]=[];
  if(researchProvider){
    const queries=topic.researchQueries??[];
    const research:DocumentResearch=await researchProvider.collect(queries,draftSignal).catch(()=>{signal.throwIfAborted();return {status:'failed' as const,queries,sources:[],findings:[],errors:[draftSignal.aborted?'SEARCH_TIMEOUT':'SEARCH_UNAVAILABLE']};});
    research.enrichment={status:'skipped',attempts:0,errorCodes:[]};
    topic={...topic,research};
    if(research.status==='unconfigured')researchWarnings.push('외부 검색 API가 연결되지 않아 추가 조사를 수행하지 않았습니다. 검색키 연결 후 문서를 다시 만들어 주세요.');
    if(research.status==='failed'||research.status==='partial')researchWarnings.push('외부 조사에 실패하거나 일부 자료만 확보했습니다. 확인되지 않은 내용은 미확인으로 남겼습니다.');
    if(research.sources.length&&ai.enrich){
      await onTemplate?.({...template,...topic,draftOnly:true,summary:'외부 자료를 확보했습니다. 판단 기준·제약·미확인 정보를 정리하고 있습니다.'});
      const enrichmentSignal=AbortSignal.any([draftSignal,AbortSignal.timeout(90000)]);
      const diagnostic:NonNullable<typeof research.enrichment>={status:'failed',attempts:0,errorCodes:[]};
      for(let attempt=0;attempt<2;attempt++){
        diagnostic.attempts++;
        try{topic=await ai.enrich(topic,research,enrichmentSignal);diagnostic.status='completed';break;}
        catch(error){
          signal.throwIfAborted();
          const code=enrichmentSignal.aborted?'AI_REQUEST_TIMEOUT':error instanceof DebateError?error.code:'AI_ENRICHMENT_FAILED';
          diagnostic.errorCodes.push(code);Logger.warn({attempt:attempt+1,code},'DocumentEnrichment');
          if(enrichmentSignal.aborted||!['AI_TOPIC_STRUCTURE','AI_TOPIC_EVIDENCE','AI_INVALID_RESPONSE','AI_BUSY','AI_UNAVAILABLE'].includes(code)||attempt===1)break;
          retries++;await delay(retryDelayMs,undefined,{signal});
        }
      }
      topic={...topic,research:{...(topic.research??research),enrichment:diagnostic}};
      if(diagnostic.status==='failed')researchWarnings.push(`외부 자료 정리에 실패해 기존 초안과 출처 목록을 보존했습니다. 오류: ${diagnostic.errorCodes.join(', ')}. 자료를 확인하고 다시 조사하거나 문서를 직접 보완해 주세요.`);

    }
  }
  signal.throwIfAborted();
  return {...template,...topic,markdown:seed?.markdown??composeMarkdown(topic,filters),markdownEdited:!!seed?.markdown,researchUpdated:!!seed?.markdown,draftOnly:false,summary:topic.summary??topic.context,keyIssues:topic.keyIssues??[topic.question],supportingLogic:topic.supportingLogic??[],opposingLogic:topic.opposingLogic??[],
    sourceCoverage:{scannedMessages:messages.length,successfulChunks:1,failedChunks:0,retries,partial:true,errorCodes:[],mode:'manual',selectedCount:messages.length},
    warnings:[...researchWarnings,messages.length?'사용자가 선택한 발언만 참고한 초안입니다.':'선택한 발언이 없어 질문만으로 초안을 만들었습니다.',...(messages.some((m,i)=>m.text.length<selectedMessages[i].text.length)?['빠른 처리를 위해 긴 발언은 앞부분만 참고했습니다. 원문 링크에서 전체 내용을 확인하세요.']:[])],
    statements:template.statements};
}

export function editDocument(original: DebateDocument, edit: DocumentEdit,filters:PersonaFilters={}): DebateDocument {
  if(edit.markdown!==undefined&&(typeof edit.markdown!=='string'||!edit.markdown.trim()||edit.markdown.length>MAX_MARKDOWN_LENGTH))throw new BadRequestException('최종 문서는 비어 있지 않은 10,000자 이하 문자열이어야 합니다.');
  const allowed = new Set(original.statements.map(statement => statement.messageId));
  if (edit.evidenceMessageIds.some(id => !allowed.has(id))) throw new BadRequestException('이 문서에 없는 발언 근거는 추가할 수 없습니다.');
  const merged:DebateDocument = { ...original,...(edit.decisionGoal!==undefined?{decisionGoal:edit.decisionGoal.trim()}:{}),...(edit.constraints?{constraints:edit.constraints}:{}),...(edit.assumptions?{assumptions:edit.assumptions}:{}), ...(edit.answerSchema?{answerSchema:validateSchema(edit.answerSchema)}:{}), ...(edit.facts?{facts:edit.facts,...(JSON.stringify(edit.facts)!==JSON.stringify(original.facts)?{factEvidence:[]}: {})}:{}), question: edit.question.trim(), proposition: edit.proposition.trim(), context: edit.context.trim(),
    summary:edit.summary?.trim()??original.summary??original.context,
    keyIssues: edit.keyIssues.map(line => line.trim()), supportingLogic: edit.supportingLogic.map(line => line.trim()),
    opposingLogic: edit.opposingLogic.map(line => line.trim()), evidenceMessageIds: edit.evidenceMessageIds };
  return {...merged,markdown:edit.markdown??(original.markdownEdited&&original.markdown?original.markdown:composeMarkdown(merged,filters)),markdownEdited:edit.markdownEdited??original.markdownEdited??false,researchUpdated:original.researchUpdated&&!(edit.markdown!==undefined&&edit.researchReviewed===true)};
}

export function analysisTopic(document: DebateDocument): DebateTopic {
  return opinionContext(document);
}
