import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { PERSONA_LIMIT } from './persona.policy';
import { dimensions, type FacetQuery, type Persona, type PersonaContext, type PersonaFacets, type PersonaFilters, type PersonaPage, type PersonaSelection, type PersonaSource } from './persona.types';

function validPersona(value: unknown): value is Persona {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return typeof row.id === 'string' && /^[0-9a-f]{32}$/.test(row.id) && Number.isInteger(row.age) && Number(row.age) >= 19 &&
    typeof row.persona === 'string' && dimensions.every(key => typeof row[key] === 'string');
}
@Injectable()
export class SupabasePersonaSource implements PersonaSource {
  constructor(private readonly db: SupabaseService) {}
  private async query(context: PersonaContext, action: string, filters: PersonaFilters, options: Record<string, unknown> = {}) {
    const { data, error } = await this.db.forUser(context.user.token).rpc('query_persona_data', {
      p_conversation_id: context.conversationId, p_action: action, p_filters: filters, p_options: options,
    });
    if (error?.code === '42501') throw new NotFoundException('페르소나를 조회할 대화를 찾을 수 없습니다.');
    if (error || !data || typeof data !== 'object') throw new ServiceUnavailableException('페르소나 데이터를 불러오지 못했습니다. DB 연결과 마이그레이션을 확인해 주세요.');
    return data as Record<string, unknown>;
  }
  async facets(context: PersonaContext, query: FacetQuery = {}) {
    const data = await this.query(context, 'facets', {}, { province: query.province ?? [], occupationSearch: query.occupationSearch ?? '', page: query.page ?? 1 });
    const values = data.values as Record<string, unknown> | undefined;
    if (!values || !dimensions.every(key => Array.isArray(values[key]) && (values[key] as unknown[]).every(value => typeof value === 'string')) || !data.occupation || !data.age) throw new ServiceUnavailableException('페르소나 선택지 형식이 올바르지 않습니다.');
    return data as unknown as PersonaFacets;
  }
  async select(filters: PersonaFilters, seed: string, previewOnly: boolean, context: PersonaContext) {
    const data = await this.query(context, previewOnly ? 'count' : 'sample', filters, { seed });
    if (!Number.isInteger(data.eligible) || Number(data.eligible) < 0 || !Array.isArray(data.personas) || data.personas.length > PERSONA_LIMIT || !data.personas.every(validPersona)) throw new ServiceUnavailableException('페르소나 표본 형식이 올바르지 않습니다.');
    return data as unknown as PersonaSelection;
  }
  async browse(filters: PersonaFilters, page: number, pageSize: number, context: PersonaContext) {
    const data = await this.query(context, 'browse', filters, { page, pageSize });
    if (!Array.isArray(data.items) || data.items.length > 50 || !data.items.every(validPersona) || !Number.isInteger(data.total)) throw new ServiceUnavailableException('페르소나 목록 형식이 올바르지 않습니다.');
    return data as unknown as PersonaPage;
  }
}
