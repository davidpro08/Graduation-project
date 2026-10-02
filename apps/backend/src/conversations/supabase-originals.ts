import { ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { AuthUser } from '../auth/auth.types';
import type { OriginalFiles } from './conversation.repository';
@Injectable()
export class SupabaseOriginals implements OriginalFiles {
  constructor(private readonly supabase: SupabaseService) {}
  async put(user: AuthUser, path: string, content: Buffer) {
    const { error }=await this.supabase.forUser(user.token).storage.from('conversation-originals').upload(path,content,{contentType:'text/plain',upsert:false});
    if (error) {
      if (error.message.toLowerCase().includes('already exists')) {
        const existing=await this.supabase.forUser(user.token).storage.from('conversation-originals').download(path);
        if (!existing.error && existing.data && Buffer.from(await existing.data.arrayBuffer()).equals(content)) return;
        throw new ConflictException('다른 원본에 사용된 업로드 ID입니다. 파일을 다시 선택해 주세요.');
      }
      throw new ServiceUnavailableException('원본 파일을 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  }
  async remove(user: AuthUser, path: string) {
    const { error }=await this.supabase.forUser(user.token).storage.from('conversation-originals').remove([path]);
    if (error) throw new ServiceUnavailableException('원본 파일을 삭제하지 못했습니다. 다시 시도해 주세요.');
  }
}
