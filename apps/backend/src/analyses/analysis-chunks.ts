import type { ChatMessage } from '../conversations/conversation.types';
import type { AnalysisType } from './analysis.types';

const minutes = (time: string) => /^\d{2}:\d{2}$/.test(time) ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : null;
export function sameSession(left: ChatMessage, right: ChatMessage) {
  const a = minutes(left.time), b = minutes(right.time);
  return left.date === right.date && (a === null || b === null || (b >= a && b - a <= 30));
}

export function groupedMessages(messages: ChatMessage[]) {
  const groups: { date: string; fromTime: string; toTime: string; messages: { id: string; time: string; speaker: string; text: string }[] }[] = [];
  messages.forEach((message, index) => {
    if (!index || !sameSession(messages[index - 1], message)) groups.push({ date: message.date, fromTime: message.time, toTime: message.time, messages: [] });
    const group = groups[groups.length - 1];
    group.toTime = message.time;
    group.messages.push({ id: message.id, time: message.time, speaker: message.speaker, text: message.text });
  });
  return groups;
}

/** 날짜·시간 순서와 원문 ID를 유지하고 긴 발언만 같은 ID의 조각으로 나눈다. */
export function analysisChunks(messages: ChatMessage[], type: AnalysisType): ChatMessage[][] {
  const chunks: ChatMessage[][] = [];
  let batch: ChatMessage[] = [], bytes = 0;
  for (const message of messages) {
    const characters = Array.from(message.text);
    for (let offset = 0; offset < characters.length; offset += 1800) {
      const part = { ...message, text: characters.slice(offset, offset + 1800).join('') };
      const size = Buffer.byteLength(JSON.stringify(part));
      const previous = batch[batch.length - 1];
      if (batch.length && (bytes + size > 7000 || batch.length >= 40 || (type === 'schedule' && previous && !sameSession(previous, part)))) {
        chunks.push(batch);
        // 같은 세션의 크기 분할에서 직전 발언 하나를 함께 보내 경계의 문맥을 보존한다.
        batch = previous && sameSession(previous, part) && previous.id !== part.id ? [previous] : [];
        bytes = batch.reduce((sum, row) => sum + Buffer.byteLength(JSON.stringify(row)), 0);
      }
      batch.push(part); bytes += size;
    }
  }
  if (batch.length) chunks.push(batch);
  return chunks;
}

export function splitAnalysisChunk(batch: ChatMessage[]): ChatMessage[][] | null {
  if (batch.length > 1) {
    const middle = Math.ceil(batch.length / 2);
    // 3개 이하에서는 엄격히 줄여 재분할 루프를 막는다.
    return [batch.slice(0, middle), batch.slice(batch.length > 3 ? middle - 1 : middle)];
  }
  const chars = Array.from(batch[0]?.text ?? '');
  if (chars.length < 2) return null;
  const middle = Math.ceil(chars.length / 2);
  return [[{ ...batch[0], text: chars.slice(0, middle).join('') }], [{ ...batch[0], text: chars.slice(middle).join('') }]];
}
