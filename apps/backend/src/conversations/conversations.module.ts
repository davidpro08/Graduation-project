import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CONVERSATIONS, ORIGINAL_FILES } from './conversation.repository';
import { ConversationsController } from './conversations.controller';
import { ConversationsService } from './conversations.service';
import { KakaoParser } from './kakao.parser';
import { SupabaseChatRepo } from './supabase-chat.repo';
import { SupabaseOriginals } from './supabase-originals';
@Module({imports:[AuthModule],controllers:[ConversationsController],providers:[ConversationsService,KakaoParser,
  {provide:CONVERSATIONS,useClass:SupabaseChatRepo},{provide:ORIGINAL_FILES,useClass:SupabaseOriginals}]})
export class ConversationsModule {}
