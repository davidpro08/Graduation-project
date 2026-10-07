import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import type { AuthRequest } from "./auth.types";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const match = /^Bearer ([^\s,]+)$/i.exec(
      request.headers.authorization ?? "",
    );
    if (!match)
      throw new UnauthorizedException("Bearer 액세스 토큰이 필요합니다.");
    request.authUser = await this.auth.verify(match[1]);
    return true;
  }
}
