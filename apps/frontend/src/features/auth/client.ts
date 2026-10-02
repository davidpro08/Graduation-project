import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

export type LoginProvider = 'google' | 'github' | 'kakao';
let client: SupabaseClient | undefined;
let callback: Promise<Session> | undefined;

export function getAuthClient() {
  if (typeof window === 'undefined') throw new Error('로그인은 브라우저에서 사용할 수 있습니다.');
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key || !key.startsWith('sb_publishable_'))
    throw new Error('로그인 연결 설정이 없습니다. 개발 환경의 Supabase 공개 설정을 확인해 주세요.');
  client = createClient(url, key, { auth: {
    flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
  } });
  return client;
}

export async function startOAuth(provider: LoginProvider) {
  callback = undefined;
  const { data, error } = await getAuthClient().auth.signInWithOAuth({ provider,
    options: { redirectTo: `${window.location.origin}/auth/callback`, skipBrowserRedirect: true },
  });
  if (error || !data.url) throw new Error('로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  window.location.assign(data.url);
}

// Strict Mode의 effect 재실행에서도 일회용 인가 코드를 한 번만 교환한다.
export function finishOAuth(): Promise<Session> {
  if (callback) return callback;
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const failed = url.searchParams.has('error') || fragment.has('error');
  const code = url.searchParams.get('code');
  const flowId = url.searchParams.get('sb_flow_id');
  // 인가 코드·오류 상세는 주소창에 남기지 않는다. SDK에 flowId를 명시한다.
  window.history.replaceState(window.history.state, '', '/auth/callback');
  callback = (async () => {
    if (failed) throw new Error('로그인이 취소되었거나 제공자 인증에 실패했습니다. 로그인 화면에서 다시 시도해 주세요.');
    const auth = getAuthClient().auth;
    if (code) {
      const { data, error } = await auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (error || !data.session) throw new Error('로그인을 완료하지 못했습니다. 같은 브라우저에서 로그인을 다시 시작해 주세요.');
      return data.session;
    }
    const { data, error } = await auth.getSession();
    if (error || !data.session) throw new Error('로그인 정보가 없습니다. 로그인 화면에서 다시 시작해 주세요.');
    return data.session;
  })();
  return callback;
}

export async function signOut() {
  const { error } = await getAuthClient().auth.signOut({ scope: 'local' });
  if (error) throw new Error('로그아웃하지 못했습니다. 다시 시도해 주세요.');
}
