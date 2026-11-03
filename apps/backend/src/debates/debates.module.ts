import { TavilyResearch } from './document-research';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { DOCUMENT_RESEARCH, DEBATE_AI, DEBATE_REPO, JEV_OPINIONS } from './debate.types';
import { PersonasModule } from '../personas/personas.module';
import { QwenDebateHttp, JevOpinionHttp } from './debate.http';
import { DebatesController } from './debates.controller';
import { DebatesService } from './debates.service';
import { SupabaseDebateRepo } from './supabase-debate.repo';
@Module({ imports: [AuthModule, ConversationsModule, PersonasModule], controllers: [DebatesController], providers: [DebatesService,{provide:DOCUMENT_RESEARCH,useClass:TavilyResearch},
  { provide: DEBATE_REPO, useClass: SupabaseDebateRepo },
  { provide: DEBATE_AI, useClass: QwenDebateHttp }, { provide: JEV_OPINIONS, useClass: JevOpinionHttp }] })
export class DebatesModule {}
