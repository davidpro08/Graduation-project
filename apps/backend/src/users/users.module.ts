import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PROFILE_REPOSITORY } from './profile.repository';
import { SupabaseProfileRepo } from './supabase-profile.repo';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ imports: [AuthModule], controllers: [UsersController], providers: [UsersService,
  { provide: PROFILE_REPOSITORY, useClass: SupabaseProfileRepo }] })
export class UsersModule {}
