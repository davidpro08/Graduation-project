import { setTimeout as delay } from 'node:timers/promises';
import type { ChatMessage } from '../conversations/conversation.types';
import { analysisChunks, splitAnalysisChunk } from './analysis-chunks';
import { AnalysisError, type AnalysisItem, type AnalysisType, type DetailAi } from './analysis.types';
import { mergeScheduleCandidates, scheduleCandidate } from './schedule-candidate';

const recoverable = new Set(['AI_CONTEXT_ERROR', 'AI_INVALID_RESPONSE', 'AI_INVALID_EVIDENCE', 'AI_INCOMPLETE_RESPONSE']);
const transient = new Set(['AI_UNAVAILABLE', 'AI_REQUEST_TIMEOUT', 'AI_BUSY']);
interface ChunkFailure { fromDate: string; fromTime: string; toDate: string; toTime: string; messageCount: number; errorCode: string }

/** 한 작업의 모델 재시도·재분할과 부분 결과를 관리한다. 저장·권한은 서비스가 담당한다. */
export class AnalysisRunner {
  constructor(private readonly ai: DetailAi, private readonly retryDelayMs = 300) {}
  async run(type: AnalysisType, messages: ChatMessage[], signal: AbortSignal, beforeChunk: () => Promise<unknown>) {
    const items: AnalysisItem[] = [], failures: ChunkFailure[] = [];
    let chunks = 0, successfulChunks = 0, retries = 0, splits = 0, networkFailures = 0;
    let model: string|null = null, circuit: string|null = null;
    const failed = (batch: ChatMessage[], errorCode: string) => {
      chunks++;
      failures.push({ fromDate: batch[0].date, fromTime: batch[0].time, toDate: batch[batch.length - 1].date,
        toTime: batch[batch.length - 1].time, messageCount: new Set(batch.map(message => message.id)).size, errorCode });
    };
    const visit = async (batch: ChatMessage[], depth = 0, recoveryDepth = 0): Promise<void> => {
      signal.throwIfAborted();
      await beforeChunk();
      if (circuit) { failed(batch, circuit); return; }
      let errorCode = 'AI_UNAVAILABLE';
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          signal.throwIfAborted();
          const tokens = await this.ai.count(type, batch, signal);
          if (tokens.count > tokens.limit) throw new AnalysisError('AI_CONTEXT_ERROR');
          const result = await this.ai.analyze(type, batch, signal);
          items.push(...result.items.map(item => {
            if(type!=='schedule')return item;
            const suggestion=scheduleCandidate(item,batch);
            return {...item,...(suggestion?{date:suggestion.date,time:suggestion.time,uncertain:suggestion.uncertain,suggestion}:{})};
          }));
          model = result.model; successfulChunks++; chunks++; networkFailures = 0;
          return;
        } catch (error) {
          signal.throwIfAborted();
          if (!(error instanceof AnalysisError)) throw error;
          errorCode = error.code;
          if (!recoverable.has(errorCode) && !transient.has(errorCode)) throw error;
          // 컨텍스트 초과는 같은 요청을 반복하지 않고 바로 나눈다.
          if (errorCode === 'AI_CONTEXT_ERROR' || attempt === 1) break;
          retries++;
          await delay(this.retryDelayMs, undefined, { signal });
        }
      }
      const parts = recoverable.has(errorCode) && depth < 12 && (errorCode === 'AI_CONTEXT_ERROR' || recoveryDepth < 2) ? splitAnalysisChunk(batch) : null;
      if (parts) {
        splits++;
        for (const part of parts) await visit(part, depth + 1, recoveryDepth + (errorCode === 'AI_CONTEXT_ERROR' ? 0 : 1));
      } else {
        failed(batch, errorCode);
        if (transient.has(errorCode) && ++networkFailures >= 3) circuit = errorCode;
      }
    };
    for (const batch of analysisChunks(messages, type)) await visit(batch);
    if (failures.length && !successfulChunks) throw new AnalysisError(failures[0].errorCode);
    const candidates=type==='schedule'?mergeScheduleCandidates(items):items;
    const unique = [...new Map(candidates.map(item => [JSON.stringify({ ...item, evidenceMessageIds: [...item.evidenceMessageIds].sort() }), item])).values()];
    const truncatedItems = Math.max(0, unique.length - 1000);
    return { items: unique.slice(0, 1000), metadata: { qwenModel: model, chunks, successfulChunks, failedChunks: failures.length,
      coverage: failures.length || truncatedItems ? 'partial' : 'complete', retries, splits, failures, truncatedItems,
      warnings: [...(chunks > 1 ? ['대화를 나눠 분석했습니다. 서로 다른 구간에 있는 발언의 연결은 누락될 수 있습니다.'] : []),
        ...(failures.length ? [`${failures.length}개 구간을 분석하지 못했습니다. 성공한 구간의 결과만 표시합니다.`] : []),
        ...(truncatedItems ? [`후보가 저장 한도1000개를 넘어 ${truncatedItems}개를 저장하지 못했습니다. 원문도 확인해 주세요.`] : []),
        ...(!messages.length ? ['분석 기간에 텍스트 메시지가 없습니다.'] : [])] } };
  }
}
