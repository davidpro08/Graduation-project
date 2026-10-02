import { Module } from '@nestjs/common';
import { HealthModule } from './health/health.module';
import { SupabaseModule } from './supabase/supabase.module';
import { UsersModule } from './users/users.module';

@Module({ imports: [HealthModule, SupabaseModule, UsersModule] })
export class AppModule {}
