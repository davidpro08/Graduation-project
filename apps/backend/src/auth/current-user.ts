import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthRequest } from "./auth.types";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<AuthRequest>().authUser,
);
