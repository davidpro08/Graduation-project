import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { PERSONA_SOURCE } from './persona.types';
import { SupabasePersonaSource } from './supabase-persona.source';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';
@Module({ imports: [AuthModule, ConversationsModule], providers: [PersonasService, { provide: PERSONA_SOURCE, useClass: SupabasePersonaSource }], controllers: [PersonasController], exports: [PERSONA_SOURCE, PersonasService] })
export class PersonasModule {}
