import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { SupabaseModule } from './supabase/supabase.module';
import { UsersModule } from './users/users.module';
import { ConversationsModule } from './conversations/conversations.module';

@Module({ imports: [HealthModule, SupabaseModule, UsersModule, ConversationsModule] })
export class AppModule {}
