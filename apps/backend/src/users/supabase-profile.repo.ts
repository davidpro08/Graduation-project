import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import type { AuthUser } from '../auth/auth.types';
import type { Profile, ProfileRepository } from './profile.repository';

@Injectable()
export class SupabaseProfileRepo implements ProfileRepository {
  constructor(private readonly supabase: SupabaseService) {}
  find(user: AuthUser) { return this.query(user); }
  update(user: AuthUser, nickname: string) { return this.query(user, nickname); }

  private async query(user: AuthUser, nickname?: string): Promise<Profile> {
    let result;
    try {
      const table = this.supabase.forUser(user.token).from('profiles');
      result = await (nickname === undefined ? table.select('id,nickname,created_at,updated_at') :
        table.update({ nickname }).select('id,nickname,created_at,updated_at')).eq('id', user.id).maybeSingle();
    } catch { throw new ServiceUnavailableException('사용자 정보 서비스를 사용할 수 없습니다.'); }
    if (result.error) throw new ServiceUnavailableException('사용자 정보 서비스를 사용할 수 없습니다.');
    if (!result.data) throw new NotFoundException('사용자 프로필이 없습니다.');
    return result.data as Profile;
  }
}
