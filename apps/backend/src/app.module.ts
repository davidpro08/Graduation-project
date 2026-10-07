import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { SupabaseModule } from './supabase/supabase.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';
import { AiModule } from './ai/ai.module';
import { AnalysesModule } from './analyses/analyses.module';

@Module({ imports: [HealthModule, SupabaseModule, UsersModule, ConversationsModule, AiModule, AnalysesModule] })
export class AppModule {}
