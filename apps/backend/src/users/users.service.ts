import { Inject, Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/auth.types';
import { PROFILE_REPOSITORY, type Profile, type ProfileRepository } from './profile.repository';
import type { UserResponse } from './user.dto';

@Injectable()
export class UsersService {
  constructor(@Inject(PROFILE_REPOSITORY) private readonly profiles: ProfileRepository) {}
  async find(user: AuthUser) { return this.response(user, await this.profiles.find(user)); }
  async update(user: AuthUser, nickname: string) { return this.response(user, await this.profiles.update(user, nickname)); }
  private response(user: AuthUser, profile: Profile): UserResponse {
    return { id: profile.id, nickname: profile.nickname, email: user.email, providers: user.providers,
      createdAt: profile.created_at, updatedAt: profile.updated_at };
  }
}
