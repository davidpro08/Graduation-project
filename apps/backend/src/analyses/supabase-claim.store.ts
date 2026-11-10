import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import type { ChatMessage } from '../conversations/conversation.types';
import { SupabaseService } from '../supabase/supabase.service';
import { AnalysisError } from './analysis.types';
import { claimVersion,sourceHash,validateClaims,type ClaimStore,type MessageClaims } from './claims';
@Injectable()
export class SupabaseClaimStore implements ClaimStore {
  constructor(private readonly db:SupabaseService){}
  async load(user:AuthUser,conversationId:string,message:ChatMessage){
    const {data,error}=await this.db.forUser(user.token).from('message_claims').select('payload').eq('owner_id',user.id).eq('conversation_id',conversationId).eq('message_id',message.id).eq('source_hash',sourceHash(message)).eq('extractor_version',claimVersion()).maybeSingle();
    if(error)throw new AnalysisError('CLAIM_STORAGE_ERROR');
    return data?validateClaims(data.payload,message):null;
  }
  async save(user:AuthUser,conversationId:string,message:ChatMessage,value:MessageClaims){
    const {error}=await this.db.forUser(user.token).from('message_claims').upsert({owner_id:user.id,conversation_id:conversationId,message_id:message.id,source_hash:sourceHash(message),extractor_version:claimVersion(),payload:validateClaims(value,message),updated_at:new Date().toISOString()},{onConflict:'message_id,extractor_version'});
    if(error)throw new AnalysisError('CLAIM_STORAGE_ERROR');
  }
}
