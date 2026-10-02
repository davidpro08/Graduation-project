import { getAuthClient } from '@/features/auth/client';

export type HealthResponse = { status: 'ok'; service: 'backend' };

export interface UserProfile {
  id: string;
  nickname: string | null;
  email: string | null;
  providers: string[];
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export async function authenticatedRequest<T>(path: string, options: { method?: string; body?: BodyInit; signal?: AbortSignal } = {}): Promise<T> {
  const auth = getAuthClient().auth;
  const { data, error } = await auth.getSession();
  if (error || !data.session) throw new ApiError(401, '로그인이 필요합니다.');
  let response: Response;
  try {
    response = await fetch(`/api${path}`, { method: options.method ?? 'GET', body: options.body, cache:'no-store',
      headers: { Authorization:`Bearer ${data.session.access_token}` },
      signal: options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(60000)]) : AbortSignal.timeout(60000) });
  } catch {
    if (options.signal?.aborted) throw new DOMException('요청 취소','AbortError');
    throw new ApiError(503,'서버 응답을 받지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok) {
    if (response.status===401) await auth.signOut({scope:'local'});
    const payload: unknown = await response.json().catch(() => null);
    const message = payload && typeof payload==='object' && 'message' in payload ? payload.message : null;
    throw new ApiError(response.status, response.status===401 ? '로그인이 만료되었습니다. 다시 로그인해 주세요.' :
      response.status===413 ? '파일은 최대 10MB까지 업로드할 수 있습니다.' : typeof message==='string' ? message : '요청을 처리하지 못했습니다. 입력 내용을 확인해 주세요.');
  }
  if (response.status===204) return undefined as T;
  return response.json() as Promise<T>;
}

async function userRequest(method: 'GET' | 'PATCH', nickname?: string, signal?: AbortSignal): Promise<UserProfile> {
  const auth = getAuthClient().auth;
  const { data, error } = await auth.getSession();
  if (error || !data.session) throw new ApiError(401, '로그인이 필요합니다.');
  let response: Response;
  try {
    response = await fetch('/api/users/me', {
      method, cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(method === 'PATCH' ? { 'Content-Type': 'application/json' } : {}) },
      ...(method === 'PATCH' ? { body: JSON.stringify({ nickname }) } : {}),
    });
  } catch {
    if (signal?.aborted) throw new DOMException('요청 취소', 'AbortError');
    throw new ApiError(503, '서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (!response.ok) {
    if (response.status === 401) await auth.signOut({ scope: 'local' });
    const messages: Record<number, string> = {
      400: '닉네임을 앞뒤 공백 없이 1~30자로 입력해 주세요.',
      401: '로그인이 만료되었습니다. 다시 로그인해 주세요.',
      404: '사용자 프로필을 찾지 못했습니다. 관리자에게 문의해 주세요.',
      503: '사용자 정보 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.',
    };
    throw new ApiError(response.status, messages[response.status] ?? '사용자 정보를 처리하지 못했습니다.');
  }
  let profile: unknown;
  try { profile = await response.json(); }
  catch { throw new ApiError(502, '사용자 정보 응답을 확인하지 못했습니다.'); }
  if (!isUserProfile(profile)) throw new ApiError(502, '사용자 정보 응답을 확인하지 못했습니다.');
  return profile;
}

function isUserProfile(value: unknown): value is UserProfile {
  if (!value || typeof value !== 'object') return false;
  const profile = value as Record<string, unknown>;
  return typeof profile.id === 'string' && (profile.nickname === null || typeof profile.nickname === 'string') &&
    (profile.email === null || typeof profile.email === 'string') && Array.isArray(profile.providers) &&
    profile.providers.every(provider => typeof provider === 'string') &&
    typeof profile.createdAt === 'string' && typeof profile.updatedAt === 'string';
}

export function getCurrentUser(signal?: AbortSignal) { return userRequest('GET', undefined, signal); }
export function updateNickname(nickname: string) { return userRequest('PATCH', nickname.trim()); }

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error('서버 상태를 확인하지 못했습니다.');
  const data: unknown = await response.json();
  if (typeof data !== 'object' || data === null || !('status' in data) ||
      data.status !== 'ok' || !('service' in data) || data.service !== 'backend') {
    throw new Error('서버 응답 형식이 올바르지 않습니다.');
  }
  return { status: data.status, service: data.service };
}
