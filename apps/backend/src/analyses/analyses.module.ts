import { ClaimPipeline } from './claim-pipeline';
import { CLAIM_STORE, CLAIM_EXTRACTOR, CLAIM_JUDGE } from './claims';
import { QwenClaimHttp, JevClaimHttp } from './claim.http';
import { SupabaseClaimStore } from './supabase-claim.store';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationsModule } from '../conversations/conversations.module';
import { ANALYSIS_REPO, DETAIL_AI } from './analysis.types';
import { AnalysesController } from './analyses.controller';
import { AnalysesService } from './analyses.service';
import { QwenHttp } from './qwen.http';
import { SupabaseAnalysisRepo } from './supabase-analysis.repo';
@Module({imports:[AuthModule,ConversationsModule],controllers:[AnalysesController],providers:[AnalysesService,ClaimPipeline,{provide:CLAIM_STORE,useClass:SupabaseClaimStore},{provide:CLAIM_EXTRACTOR,useClass:QwenClaimHttp},{provide:CLAIM_JUDGE,useClass:JevClaimHttp},{provide:ANALYSIS_REPO,useClass:SupabaseAnalysisRepo},{provide:DETAIL_AI,useClass:QwenHttp}]})
export class AnalysesModule {}
