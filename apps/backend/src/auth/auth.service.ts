import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { SupabaseService } from "../supabase/supabase.service";
import type { AuthUser } from "./auth.types";

@Injectable()
export class AuthService {
  constructor(private readonly supabase: SupabaseService) {}

  async verify(token: string): Promise<AuthUser> {
    let result;
    try {
      result = await this.supabase.forUser(token).auth.getUser(token);
    } catch {
      throw new ServiceUnavailableException(
        "인증 서비스를 사용할 수 없습니다.",
      );
    }
    if (result.error) {
      if (
        result.error.status === 400 ||
        result.error.status === 401 ||
        result.error.status === 403
      )
        throw new UnauthorizedException("유효한 액세스 토큰이 필요합니다.");
      throw new ServiceUnavailableException(
        "인증 서비스를 사용할 수 없습니다.",
      );
    }
    const user = result.data.user;
    if (!user || user.is_anonymous)
      throw new UnauthorizedException("유효한 사용자 인증이 필요합니다.");
    return {
      id: user.id,
      email: user.email ?? null,
      providers: [
        ...new Set(
          (user.identities ?? []).map((identity) => identity.provider),
        ),
      ].sort(),
      token,
    };
  }
}
