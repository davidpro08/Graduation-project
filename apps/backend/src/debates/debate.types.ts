import type { AuthUser } from '../auth/auth.types';
import type { ChatMessage } from '../conversations/conversation.types';

export { dimensions, dimensionValue, PERSONA_SOURCE } from '../personas/persona.types';
export type { Dimension, PersonaFilters, PersonaProfile, Persona, PersonaSelection, PersonaSource } from '../personas/persona.types';
import type { PersonaFilters, PersonaProfile, Persona } from '../personas/persona.types';
export interface SourceStatement { messageId: string; participantId: string | null; speaker: string; text: string }
export interface AnswerOption { id:string; label:string; min?:number; max?:number|null }
export interface AnswerSchema { kind:"stance"|"numeric"|"choice"; unit:string; basis:string; options:AnswerOption[] }
export interface FactEvidence { text:string; kind:"reported"|"opinion"|"assumption"|"unknown"; messageId:string|null; quote:string|null }
export interface ResearchSource {id:string;title:string;url:string;content:string;publishedAt:string|null;retrievedAt:string;queries?:string[]}
export interface ResearchFinding {text:string;sourceId:string;quote:string;snippetId?:string}
export interface DocumentResearch {
  status:'unconfigured'|'not_needed'|'ready'|'partial'|'failed';queries:string[];sources:ResearchSource[];findings:ResearchFinding[];errors:string[];
  queryResults?:{query:string;status:'ready'|'empty'|'failed';sourceIds:string[];errorCode?:string}[];
  enrichment?:{status:'completed'|'failed'|'skipped';attempts:number;errorCodes:string[]};
}
export interface ResearchProvider { collect(queries:string[],signal:AbortSignal):Promise<DocumentResearch> }
export const DOCUMENT_RESEARCH=Symbol('DOCUMENT_RESEARCH');
export interface DebateTopic {
  markdown?:string;markdownEdited?:boolean;documentFormat?:'markdown';
  researchQueries?:string[];research?:DocumentResearch;decisionGoal?:string;constraints?:string[];assumptions?:string[];

  factEvidence?:FactEvidence[];
  answerSchema?:AnswerSchema; facts?:string[];
  question: string; proposition: string; context: string; evidenceMessageIds: string[]; summary?: string;
  keyIssues?: string[]; supportingLogic?: string[]; opposingLogic?: string[]; statements?: SourceStatement[];
}
export interface DebateDocument extends DebateTopic {
  researchUpdated?:boolean;
  basedOn?:{id:string;revision:number};
  draftOnly?:boolean; selectedMessageIds?:string[];
  keyIssues: string[]; supportingLogic: string[]; opposingLogic: string[]; statements: SourceStatement[];
  sourceCoverage?: { mode?:'keyword'|'manual';selectedCount?:number;keywords?:string[];matchedMessages?:number;searchFailed?:boolean; scannedMessages: number; successfulChunks: number; failedChunks: number; retries: number; partial: boolean; errorCodes: string[] };
  warnings?: string[];
}
export interface DocumentEdit {
  markdown?:string;markdownEdited?:boolean;
  researchReviewed?:boolean;
  decisionGoal?:string;constraints?:string[];assumptions?:string[];answerSchema?:AnswerSchema; facts?:string[]; revision: number; question: string; proposition: string; context: string; summary?: string;
  keyIssues: string[]; supportingLogic: string[]; opposingLogic: string[]; evidenceMessageIds: string[];
}
export interface Opinion { optionId?:string; numericValue?:number|null; personaBasis?:string; agreement: number; confidence: number; opinion: string; answer?: string; scoreKind?: 'conditional_option_probability'; optionProbabilities?: number[] }
export interface PersonaResponse {
  persona: PersonaProfile; mode: 'detail' | 'jev'; status: 'completed' | 'failed';
  opinion?: Opinion; model?: string; errorCode?: string;
}
export interface DebateResult {
  topic: DebateTopic; filters: PersonaFilters; eligible: number; selected: number;
  detailTarget: number; jevTarget: number; responses: PersonaResponse[];
  statistics: ReturnType<typeof import('./debate.statistics').aggregate>;
}
export interface DebateJob {
  id: string; conversationId: string; input: string; filters: PersonaFilters;
  speakerIds: string[]; revision: number; document: DebateDocument | null;
  status: 'pending' | 'processing' | 'review' | 'completed' | 'failed';
  stage: string; processed: number; selected: number; errorCode: string | null;
  result: DebateResult | null; createdAt: string;
}
export interface DebateRepo {
  create(user: AuthUser, id: string, conversationId: string, input: string, filters: PersonaFilters, speakerIds: string[]): Promise<DebateJob>;
  find(user: AuthUser, id: string): Promise<DebateJob>;
  latest(user: AuthUser, conversationId: string): Promise<DebateJob | null>;
  history(user: AuthUser, conversationId: string, page: number): Promise<{ items: DebateJob[]; total: number }>;
  review(user: AuthUser, id: string, document: DebateDocument): Promise<void>;
  saveDocument(user: AuthUser, id: string, revision: number, document: DebateDocument): Promise<DebateJob>;
  claim(user: AuthUser, id: string, revision: number): Promise<DebateJob>;
  progress(user: AuthUser, id: string, stage: string, processed: number, selected: number, document?:DebateDocument): Promise<void>;
  finish(user: AuthUser, id: string, result: DebateResult): Promise<void>;
  fail(user: AuthUser, id: string, code: string): Promise<void>;
}
export interface DebateAi {
  ready(): void;
  enrich?(topic:DebateTopic,research:DocumentResearch,signal:AbortSignal):Promise<DebateTopic>;
  refine(input: string, messages: ChatMessage[], previous: DebateTopic | null, signal: AbortSignal): Promise<DebateTopic>;
  respond(topic: DebateTopic, persona: Persona, signal: AbortSignal): Promise<{ opinion: Opinion; model: string }>;
}
export interface JevOpinions {
  ready(): void;
  respond(topic: DebateTopic, persona: Persona, signal: AbortSignal): Promise<{ opinion: Opinion; model: string }>;
}
export const DEBATE_REPO = Symbol('DEBATE_REPO');
export const DEBATE_AI = Symbol('DEBATE_AI');
export const JEV_OPINIONS = Symbol('JEV_OPINIONS');
export class DebateError extends Error { constructor(readonly code: string) { super(code); } }
