import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiModule } from '../ai/ai.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ANALYSIS_REPO, DETAIL_AI } from './analysis.types';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { QwenHttp } from './qwen.http';
import { SupabaseAnalysisRepo } from './supabase-analysis.repo';
@Module({imports:[AuthModule,AiModule,ConversationsModule],controllers:[AnalysesController],providers:[AnalysesService,{provide:ANALYSIS_REPO,useClass:SupabaseAnalysisRepo},{provide:DETAIL_AI,useClass:QwenHttp}]})
export class AnalysesModule {}
