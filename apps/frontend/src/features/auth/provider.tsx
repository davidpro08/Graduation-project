'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getCurrentUser, type UserProfile } from '@/lib/api';
import { getAuthClient } from './client';

interface AuthStore {
  ready: boolean;
  signedIn: boolean;
  userId: string | null;
  user: UserProfile | null;
  error: string;
  refreshProfile: () => Promise<UserProfile>;
}
const AuthContext = createContext<AuthStore | null>(null);
const subscribeHydration = () => () => {};
const clientHydrated = () => true;
const serverHydrated = () => false;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [error, setError] = useState('');
  const currentSession = useRef<Session | null>(null);
  useEffect(() => {
    try {
      const { data } = getAuthClient().auth.onAuthStateChange((_event, current) => {
        // SDK 이벤트 안에서는 세션만 반영하고 HTTP 요청은 별도 effect에서 처리한다.
        currentSession.current = current;
        setSession(current); setReady(true); setUser(null); setError('');
      });
      return () => data.subscription.unsubscribe();
    } catch (cause) {
      setReady(true);
      setError(cause instanceof Error ? cause.message : '로그인 설정을 확인하지 못했습니다.');
    }
  }, []);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    getCurrentUser(controller.signal).then(profile => {
      if (!controller.signal.aborted && currentSession.current?.user.id === profile.id) { setUser(profile); setError(''); }
    }).catch(cause => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '사용자 정보를 확인하지 못했습니다.');
    });
    return () => controller.abort();
  }, [session]);
  const refreshProfile = useCallback(async () => {
    const profile = await getCurrentUser();
    if (currentSession.current?.user.id === profile.id) { setUser(profile); setError(''); }
    return profile;
  }, []);
  return <AuthContext.Provider value={{ ready, signedIn: !!session, userId:session?.user.id ?? null, user, error, refreshProfile }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const store = useContext(AuthContext);
  const hydrated=useSyncExternalStore(subscribeHydration,clientHydrated,serverHydrated);
  if (!store) throw new Error('AuthProvider가 필요합니다.');
  // 스트리밍된 페이지가 늦게 hydration되어도 최초 로그인 표시는 서버와 일치한다.
  return hydrated?store:{...store,ready:false,signedIn:false,userId:null,user:null,error:''};
}
