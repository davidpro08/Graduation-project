import type { AuthUser } from '../auth/auth.types';

export interface Profile {
  id: string;
  nickname: string | null;
  created_at: string;
  updated_at: string;
}

export const PROFILE_REPOSITORY = Symbol('PROFILE_REPOSITORY');
export interface ProfileRepository {
  find(user: AuthUser): Promise<Profile>;
  update(user: AuthUser, nickname: string): Promise<Profile>;
}
