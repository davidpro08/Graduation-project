import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import { PERSONA_SOURCE, type FacetQuery, type PersonaFilters, type PersonaSource } from './persona.types';
import { PERSONA_LIMIT, DETAIL_LIMIT } from './persona.policy';

@Injectable()
export class PersonasService {
  constructor(@Inject(PERSONA_SOURCE) private readonly source: PersonaSource, private readonly chats: ConversationsService) {}
  private async context(user: AuthUser, conversationId: string) { await this.chats.find(user, conversationId); return { user, conversationId }; }
  async facets(user: AuthUser, conversationId: string, query: FacetQuery) { return this.source.facets(await this.context(user, conversationId), query); }
  async preview(user: AuthUser, conversationId: string, filters: PersonaFilters) {
    const selection = await this.source.select(filters, 'preview', true, await this.context(user, conversationId));
    const selected = Math.min(PERSONA_LIMIT, selection.eligible);
    return { eligible: selection.eligible, selected, detail: Math.min(DETAIL_LIMIT, selected), jev: Math.max(0, selected - DETAIL_LIMIT), warnings: selected > 0 && selected <= DETAIL_LIMIT ? ['표본이 20명 이하이므로 상세 응답만 생성하며 JEV 스펙트럼은 집계하지 않습니다.'] : [] };
  }
  async search(user: AuthUser, conversationId: string, filters: PersonaFilters, page: number, pageSize: number) { return this.source.browse(filters, page, pageSize, await this.context(user, conversationId)); }
  async sample(user: AuthUser, conversationId: string, filters: PersonaFilters, seed: string = randomUUID()) {
    const selection = await this.source.select(filters, seed, false, await this.context(user, conversationId));
    return { ...selection, seed, selected: selection.personas.length, detail: Math.min(DETAIL_LIMIT, selection.personas.length), jev: Math.max(0, selection.personas.length - DETAIL_LIMIT) };
  }
}
