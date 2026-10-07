'use client';

import Link from 'next/link';
import { useAuth } from './provider';

export function AccountMenu() {
  const { ready, signedIn, user } = useAuth();
  return <Link href="/login" className="account-link">{!ready ? '계정 확인 중…' : signedIn ? user?.nickname ?? '내 계정' : '로그인'}</Link>;
}
