export interface AuthUser {
  id: string;
  email: string | null;
  providers: string[];
  token: string;
}

export interface AuthRequest {
  headers: { authorization?: string };
  authUser?: AuthUser;
}
