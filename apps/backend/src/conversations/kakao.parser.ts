import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ChatMessage, ParsedChat, Participant } from './conversation.types';

const DATE = /^(?:-+\s*)?(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일(?:\s+[^\d]*)?$/;
const PC = /^\[(.+)\] \[(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2})\] ?(.*)$/i;
const MOBILE = /^(\d{4})[년.-]\s*(\d{1,2})[월.-]\s*(\d{1,2})(?:일|\.)?\s+(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2}),\s(.+?)\s:\s?(.*)$/i;
const MOBILE_SYSTEM = /^(\d{4})[년.-]\s*(\d{1,2})[월.-]\s*(\d{1,2})(?:일|\.)?\s+(오전|오후|AM|PM)?\s*(\d{1,2}):(\d{2}),\s(.+)$/i;
const SYSTEM = /(?:님이 (?:들어왔습니다|나갔습니다|.*초대했습니다)|메시지가 삭제되었습니다|삭제된 메시지입니다)[.]?$/;
const ATTACHMENT = /^(?:사진(?: \d+장)?|동영상|이모티콘|음성메시지|파일(?:: .+)?|사진을 보냈습니다\.?|동영상을 보냈습니다\.?)$/;

function dateOf(y: string, m: string, d: string) {
  const value = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new BadRequestException('대화에 올바르지 않은 날짜가 있습니다.');
  return value;
}
function timeOf(period: string | undefined, h: string, m: string) {
  let hour = Number(h); const minute = Number(m);
  if (minute > 59 || hour > (period ? 12 : 23) || (period && hour < 1)) throw new BadRequestException('대화에 올바르지 않은 시간이 있습니다.');
  if (period) hour = hour % 12 + (/오후|PM/i.test(period) ? 12 : 0);
  return `${String(hour).padStart(2, '0')}:${m}`;
}
export function decodeChat(buffer: Buffer) {
  try {
    if (buffer[0] === 0xff && buffer[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(buffer);
    if (buffer[0] === 0xfe && buffer[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(buffer);
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
    catch { return new TextDecoder('euc-kr', { fatal: true }).decode(buffer); }
  } catch { throw new BadRequestException('지원하지 않는 파일 인코딩입니다. UTF-8 TXT로 다시 내보내 주세요.'); }
}

@Injectable()
export class KakaoParser {
  parse(buffer: Buffer): ParsedChat {
    const text = decodeChat(buffer).replace(/^\uFEFF/, '').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
    if (!text.trim() || text.includes('\0')) throw new BadRequestException('비어 있거나 텍스트가 아닌 파일입니다.');
    const participants: Participant[] = []; const names = new Map<string, Participant>();
    const messages: ChatMessage[] = []; let date = ''; let last: ChatMessage | undefined; let ignored = 0;
    const append = (name: string | null, day: string, time: string, body: string) => {
      let participant: Participant | undefined;
      if (name !== null) {
        if(!name.trim() || name.length>200)throw new BadRequestException('참여자 이름은 1~200자까지 지원합니다.');
        participant = names.get(name);
        if (!participant) {
          if (participants.length >= 400) throw new BadRequestException('현재 대화당 참여자는 최대 400명까지 지원합니다.');
          participant = { id: randomUUID(), name, colorIndex: participants.length };
          participants.push(participant); names.set(name, participant);
        }
      }
      last = { id: randomUUID(), sequence: messages.length, participantId: participant?.id ?? null,
        speaker: name ?? '시스템', date: day, time, text: body, kind: name === null ? 'system' : ATTACHMENT.test(body) ? 'attachment' : 'text' };
      messages.push(last);
      if (messages.length > 100000) throw new BadRequestException('메시지는 최대 100,000개까지 지원합니다. 기간을 나누어 내보내 주세요.');
    };
    for (const line of text.split('\n')) {
      const divider = DATE.exec(line.trim());
      if (divider) { date = dateOf(divider[1], divider[2], divider[3]); last = undefined; continue; }
      const mobile = MOBILE.exec(line);
      if (mobile) { date = dateOf(mobile[1], mobile[2], mobile[3]); append(mobile[7], date, timeOf(mobile[4], mobile[5], mobile[6]), mobile[8]); continue; }
      const pc = PC.exec(line);
      if (pc) {
        if (!date) throw new BadRequestException('메시지 앞에 날짜 구분선이 없습니다. 카카오톡에서 다시 내보내 주세요.');
        append(pc[1], date, timeOf(pc[2], pc[3], pc[4]), pc[5]); continue;
      }
      const system = MOBILE_SYSTEM.exec(line);
      if (system && SYSTEM.test(system[7])) { date = dateOf(system[1], system[2], system[3]); append(null, date, timeOf(system[4], system[5], system[6]), system[7]); continue; }
      if (date && SYSTEM.test(line)) { append(null, date, '', line); continue; }
      // 메시지처럼 시작하지만 해석할 수 없는 행은 앞 메시지에 조용히 붙이지 않는다.
      if (/^\[.+\] \[|^\d{4}[년.-].*,.* :/.test(line)) throw new BadRequestException('해석할 수 없는 메시지 형식이 있습니다. 카카오톡 TXT 내보내기 파일을 확인해 주세요.');
      if (last) { last.text += `\n${line}`; if (last.kind === 'attachment') last.kind = 'text'; }
      else if (line.trim()) ignored++;
    }
    for (const message of messages) message.text = message.text.replace(/\n+$/, '');
    if (!participants.length || !messages.some(m => m.kind !== 'system')) throw new BadRequestException('카카오톡 메시지를 찾지 못했습니다. PC 또는 모바일에서 내보낸 TXT를 선택해 주세요.');
    return { participants, messages, warnings: [
      ...(ignored ? [`대화 제목·저장 시각 등 메시지가 아닌 안내 ${ignored}줄을 제외했습니다.`] : []),
      ...(messages.some(m => m.kind === 'system') ? ['입장·퇴장 등 시스템 메시지는 통계에서 제외합니다.'] : []),
      '파일에 표시된 동일 이름은 같은 참여자로 처리합니다. 사진·파일의 실제 내용은 TXT에 포함되지 않습니다.',
    ] };
  }
}
