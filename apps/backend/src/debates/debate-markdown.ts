import { BadRequestException } from '@nestjs/common';
import type { DebateTopic, PersonaFilters } from './debate.types';

export const MAX_MARKDOWN_LENGTH = 10000;
const filterLabels: Record<string, string> = { ageGroup:'연령',sex:'성별',province:'시도',education:'학력',maritalStatus:'혼인',familyType:'동거',occupation:'직업',district:'시군구',bachelorsField:'전공',housingType:'주택',militaryStatus:'현역 여부' };
const bullets = (items: string[] | undefined, fallback: string) => items?.length ? items.map(item => `- ${item}`).join('\n') : `- ${fallback}`;
const linkText = (value:string) => value.replace(/[[\]\\]/g, '\\$&').replace(/\s+/g,' ');

/** 조사는 데이터로 보존하고, 사람이 확인할 최종 판단 문서는 한 곳에서 조립한다. 원문 대화는 포함하지 않는다. */
export function composeMarkdown(topic: DebateTopic, filters: PersonaFilters = {}): string {
  const sources = topic.research?.sources ?? [];
  const findings = topic.research?.findings ?? [];
  const sourceLines = sources.map(source => {
    const evidence = findings.filter(finding => finding.sourceId === source.id);
    return `### ${source.id}. ${linkText(source.title)}\n\n` +
      `[출처 열기](<${source.url}>) · 발행일: ${source.publishedAt ?? '미확인'} · 조회일: ${source.retrievedAt.slice(0,10)}\n\n` +
      (evidence.length ? evidence.map(f => (f.snippetId ? '- 선택한 원문 발췌 (조건·시점 확인 필요):' : `- AI가 정리한 설명 (내용 확인 필요): ${f.text}`) + `\n\n> ${f.quote.replaceAll('\n','\n> ')}`).join('\n\n') :
        `- 미검토 검색 발췌: ${source.content.slice(0,240).replace(/\s+/g,' ')}\n- 이 발췌의 조건 적합성은 확인이 필요합니다.`);
  });
  const queryLines = topic.research?.queryResults?.map(result => `${result.query}: ${result.status === 'ready' ? `출처 ${result.sourceIds.join(', ')}` : result.status === 'empty' ? '자료 없음' : `검색 실패 (${result.errorCode})`}`);
  const markdown = [
    '# 페르소나 논쟁 판단 문서',
    `## 질문\n\n${topic.question}`,
    `## 판단 목적\n\n${topic.decisionGoal ?? topic.proposition}`,
    `## 대화에서 정리한 맥락\n\n${topic.summary ?? topic.context}`,
    `## 주어진 조건\n\n${bullets(topic.constraints,'추가 조건이 확정되지 않았습니다.')}`,
    `## 가정·예시 시나리오\n\n${bullets(topic.assumptions,'확정된 가정이 없습니다. 필요한 경우 조건별로 구분해 답하세요.')}`,
    `## 사실·주장·미확인 사항\n\n${bullets(topic.facts,'질문 외에 확인된 정보가 없습니다.')}`,
    `## 조사한 외부 자료\n\n${sourceLines.join('\n\n') || '확보한 외부 자료가 없습니다.'}` +
      (queryLines?.length ? `\n\n### 검색 범위\n\n${bullets(queryLines,'')}` : '') +
      (topic.research?.enrichment?.status === 'failed' ? `\n\n자료 정리 실패: ${topic.research.enrichment.errorCodes.join(', ')}. 위 발췌를 확인하고 필요한 정보를 직접 보완하세요.` : ''),
    `## 핵심 쟁점\n\n${bullets(topic.keyIssues,'질문에 필요한 판단 기준을 확인하세요.')}`,
    `## 비교할 관점\n\n### 첫 관점\n\n${bullets(topic.supportingLogic,'추가 논거가 정리되지 않았습니다.')}\n\n### 다른 관점\n\n${bullets(topic.opposingLogic,'추가 논거가 정리되지 않았습니다.')}`,
    `## 답변 기준\n\n${topic.answerSchema?.basis ?? topic.proposition}\n\n` +
      (topic.answerSchema ? `- 답변 유형: ${{numeric:'수치형',stance:'찬반형',choice:'선택형'}[topic.answerSchema.kind]}\n` +
        (topic.answerSchema.unit ? `- 단위: ${topic.answerSchema.unit}\n` : '') +
        bullets(topic.answerSchema.options.map(o => `${o.id}: ${o.label}`),'') + '\n\n' : '') +
      '확인된 정보와 가정을 구분하고, 필수 정보가 없으면 판단을 보류하거나 조건별로 답하세요. 검색 가격을 실제 결제액으로 간주하지 마세요.',
    `## 분석 대상\n\n${bullets(Object.entries(filters).filter(([,values]) => values?.length).map(([key,values]) => `${filterLabels[key] ?? key}: ${values!.join(', ')}`),'전체 페르소나에서 표본을 선택합니다.')}\n\n합성 페르소나의 관점이며 실제 여론조사 결과가 아닙니다.`,
  ].join('\n\n');
  if (markdown.length > MAX_MARKDOWN_LENGTH) throw new BadRequestException('최종 문서는 10,000자 이하여야 합니다. 조건과 자료 내용을 줄여 주세요.');
  return markdown;
}
