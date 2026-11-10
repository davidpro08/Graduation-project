import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/auth.types';
import { ConversationsService } from '../conversations/conversations.service';
import { PERSONA_SOURCE, type FacetQuery, type PersonaFilters, type PersonaSource } from './persona.types';
import { allocatePersonas, personaBudget } from './persona.policy';

@Injectable()
export class PersonasService {
  private readonly budget = personaBudget();
  constructor(@Inject(PERSONA_SOURCE) private readonly source: PersonaSource, private readonly chats: ConversationsService) {}
  private async context(user: AuthUser, conversationId: string) { await this.chats.find(user, conversationId); return { user, conversationId }; }
  async facets(user: AuthUser, conversationId: string, query: FacetQuery) { return this.source.facets(await this.context(user, conversationId), query); }
  async preview(user: AuthUser, conversationId: string, filters: PersonaFilters) {
    const selection = await this.source.select(filters, 'preview', true, await this.context(user, conversationId));
    const allocation = allocatePersonas(selection.eligible, this.budget);
    return { eligible: selection.eligible, ...allocation, warnings: allocation.selected > 0 && allocation.jev === 0 ? ['현재 표본과 인원 설정에서는 상세 응답만 생성하며 JEV 스펙트럼은 집계하지 않습니다.'] : [] };
  }
  async search(user: AuthUser, conversationId: string, filters: PersonaFilters, page: number, pageSize: number) { return this.source.browse(filters, page, pageSize, await this.context(user, conversationId)); }
  async sample(user: AuthUser, conversationId: string, filters: PersonaFilters, seed: string = randomUUID()) {
    const selection = await this.source.select(filters, seed, false, await this.context(user, conversationId));
    const personas = selection.personas.slice(0, this.budget.total);
    return { ...selection, personas, seed, ...allocatePersonas(personas.length, this.budget) };
  }
}
