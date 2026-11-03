export interface DocumentResearch {status:'unconfigured'|'not_needed'|'ready'|'partial'|'failed';queries:string[];sources:{id:string;title:string;url:string;content:string;publishedAt:string|null;retrievedAt:string;queries?:string[]}[];findings:{text:string;sourceId:string;quote:string;snippetId?:string}[];errors:string[];queryResults?:{query:string;status:'ready'|'empty'|'failed';sourceIds:string[];errorCode?:string}[];enrichment?:{status:'completed'|'failed'|'skipped';attempts:number;errorCodes:string[]}}
export interface AnswerSchema {kind:"stance"|"numeric"|"choice";unit:string;basis:string;options:{id:string;label:string;min?:number;max?:number|null}[]}
export const basicDimensions = ['ageGroup', 'sex', 'province', 'education', 'maritalStatus', 'familyType'] as const;
export const advancedDimensions = ['occupation', 'district', 'bachelorsField', 'housingType', 'militaryStatus'] as const;
export const dimensions = [...basicDimensions, ...advancedDimensions] as const;
export type Dimension = typeof dimensions[number];
export const dimensionLabels: Record<Dimension, string> = { sex: '성별', province: '시도', education: '학력', occupation: '직업', ageGroup: '연령대', maritalStatus: '혼인 상태', familyType: '동거 형태', district: '시군구', bachelorsField: '학사 전공', housingType: '주택 유형', militaryStatus: '현역 여부' };
export type Filters = Partial<Record<Dimension, string[]>>;
export type Facets = Record<Dimension, string[]>;
export interface FacetResponse { values: Facets; occupation: { total: number; page: number; pageSize: number; search: string }; population: number; age: { min: number; max: number } }
export interface Preview { eligible: number; selected: number; detail: number; jev: number; warnings: string[] }
export type Profile = { id: string; name?: string; age: number; sex: string; province: string; education: string; occupation: string; ageGroup: string } & Partial<Record<Dimension, string>>;
export const dimensionValue = (profile: Profile, key: Dimension) => profile[key] || '미상';
const provinceNames: Record<string, string> = { 충청북: '충북', 충청남: '충남', 경상북: '경북', 경상남: '경남', 전라남: '전남' };
export const optionLabel = (key: Dimension, value: string) => key === 'province' ? provinceNames[value] ?? value : key === 'district' ? value.replace(/^([^-]+)-/, (_, province: string) => `${provinceNames[province] ?? province} · `) : key === 'militaryStatus' && value === '비현역' ? '비현역 (군필·미필 구분 없음)' : value;
export interface Response { persona: Profile; mode: 'detail' | 'jev'; status: 'completed' | 'failed'; opinion?: {optionId?:string;numericValue?:number|null;personaBasis?:string; agreement: number; confidence: number; opinion: string; answer?: string; scoreKind?: 'conditional_option_probability'; optionProbabilities?: number[] }; model?: string; errorCode?: string }
export interface Statistics {
  numericSummary?:{count:number;mean:number;median:number;min:number;max:number}|null; selected: number; answered: number; failed: number; detailAnswered: number; jevAnswered: number;
  distribution: { label: string; count: number }[];
  jevAgreement: number | null; jevConfidence: number | null;
  jevScoreKind?: 'conditional_option_probability' | 'self_reported' | 'mixed' | null;
  demographics: Record<Dimension, { value: string; numericSummary?:{count:number;mean:number;median:number;min:number;max:number}|null; selected: number; answered: number; counts: number[] }[]>;
  spectrum: { personaId: string; agreement: number; confidence: number; alignment: number | null }[];
}
export interface SourceStatement { messageId: string; participantId: string | null; speaker: string; text: string }
export interface Topic {markdown?:string;markdownEdited?:boolean;documentFormat?:'markdown';researchQueries?:string[];decisionGoal?:string;constraints?:string[];assumptions?:string[];research?:DocumentResearch;factEvidence?:{text:string;kind:"reported"|"opinion"|"assumption"|"unknown";messageId:string|null;quote:string|null}[];answerSchema?:AnswerSchema;facts?:string[]; question: string; proposition: string; context: string; evidenceMessageIds: string[]; summary?:string; keyIssues?: string[]; supportingLogic?: string[]; opposingLogic?: string[]; statements?: SourceStatement[] }
export interface DebateDocument extends Topic {researchUpdated?:boolean;basedOn?:{id:string;revision:number};draftOnly?:boolean;selectedMessageIds?:string[]; keyIssues: string[]; supportingLogic: string[]; opposingLogic: string[]; statements: SourceStatement[];warnings?:string[];sourceCoverage?:{mode?:'keyword'|'manual';selectedCount?:number;keywords?:string[];matchedMessages?:number;searchFailed?:boolean;scannedMessages:number;successfulChunks:number;failedChunks:number;retries:number;partial:boolean;errorCodes:string[]} }
export interface DocumentEdit {researchReviewed?:boolean;markdown?:string;markdownEdited?:boolean;decisionGoal?:string;constraints?:string[];assumptions?:string[];answerSchema?:AnswerSchema;facts?:string[]; revision: number; question: string; proposition: string; context: string; summary?:string; keyIssues: string[]; supportingLogic: string[]; opposingLogic: string[]; evidenceMessageIds: string[] }
export interface Result { topic: Topic; filters: Filters; eligible: number; selected: number; detailTarget: number; jevTarget: number; responses: Response[]; statistics: Statistics }
export interface Job { id: string; conversationId: string; input: string; filters: Filters; speakerIds: string[]; revision: number; document: DebateDocument | null; status: 'pending' | 'processing' | 'review' | 'completed' | 'failed'; stage: string; processed: number; selected: number; errorCode: string | null; result: Result | null; createdAt?: string }
export const colors = ['#a8324b', '#cf795b', '#92999d', '#479c94', '#19665f','#7970af','#b28a32','#3e78a2','#687477'];
export const percent = (n: number | null) => n === null ? '집계 불가' : `${(n * 100).toFixed(1)}%`;
export function failure(code: string | null) {
  if(code==='AI_TOPIC_STRUCTURE')return '대화 요약 문서의 필수 항목 형식이 올바르지 않습니다. 다시 문서를 만들어 주세요.';
  if(code==='AI_TOPIC_LENGTH')return 'AI가 요약 문서의 항목을 너무 길게 생성했습니다. 다시 문서를 만들어 주세요.';
  if(code==='AI_TOPIC_EVIDENCE')return 'AI가 요약 문서에 입력과 일치하지 않는 발언 근거를 반환했습니다. 다시 문서를 만들어 주세요.';
  if(code?.endsWith('_REQUEST_TIMEOUT'))return 'AI 서버 응답 대기 시간이 초과됐습니다. 잠시 후 다시 시도해 주세요.';
  if(code?.endsWith('_BUSY'))return 'AI 서버에 요청이 몰려 있습니다. 잠시 후 다시 시도해 주세요.';
  const messages: Record<string, string> = {
    JEV_NOT_CONFIGURED: '학교 JEV 서버가 아직 연결되지 않았습니다. 서버 연결 후 다시 분석해 주세요.',
    PERSONA_NOT_CONFIGURED: '페르소나 DB 연결 설정을 확인해 주세요.',
    PERSONA_UNAVAILABLE: '페르소나 DB에 연결하지 못했습니다. DB 연결과 마이그레이션을 확인해 주세요.',
    NO_PERSONAS: '선택한 조건에 해당하는 페르소나가 없습니다. 조건을 줄여 주세요.',
    NO_VALID_RESPONSES: '유효한 응답이 없습니다. 학교 모델의 응답 형식과 컨텍스트 길이를 확인해 주세요.',
    AI_CONTEXT_ERROR: '모델의 컨텍스트 한도를 넘었습니다. 서버의 컨텍스트 설정을 확인해 주세요.',
    AI_UNAVAILABLE: '학교 Qwen 서버에 연결하지 못했습니다.', JEV_UNAVAILABLE: '학교 JEV 서버에 연결하지 못했습니다.',
    AI_AUTH_ERROR: 'Qwen 서버 인증 설정을 확인해 주세요.', JEV_AUTH_ERROR: 'JEV 서버 인증 설정을 확인해 주세요.',
    JOB_INTERRUPTED: '백엔드 재시작으로 분석이 중단됐습니다. 다시 분석해 주세요.', DEBATE_TIMEOUT: '분석 제한 시간 2시간을 초과했습니다.',
  };
  return messages[code ?? ''] ?? '분석을 완료하지 못했습니다. 서버 연결과 응답 형식을 확인한 뒤 다시 시도해 주세요.';
}
