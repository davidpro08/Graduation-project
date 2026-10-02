'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, Notice } from '@/components/layout';
import { finishOAuth } from './client';
import { useAuth } from './provider';

export function CallbackPage() {
  const router = useRouter();
  const { refreshProfile } = useAuth();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    finishOAuth().then(() => active ? refreshProfile() : null).then(profile => {
      if (active && profile) router.replace('/conversations');
    }).catch(cause => {
      if (active) setError(cause instanceof Error ? cause.message : '로그인을 완료하지 못했습니다.');
    });
    return () => { active = false; };
  }, [attempt, refreshProfile, router]);
  return <main className="login-page auth-callback" id="main-content">
    <Link className="brand" href="/login">그랬잖아</Link>
    <Card title={error ? '로그인 연결을 확인해 주세요' : '로그인 완료 중'}>
      {error ? <div className="stack"><Notice tone="error">{error}</Notice><p className="muted">인증 후 서버 연결에 실패했다면 다시 확인할 수 있습니다.</p><Button onClick={() => { setError(''); setAttempt(value => value + 1); }}>다시 확인</Button><Button asChild variant="outline"><Link href="/login">로그인 화면으로 돌아가기</Link></Button></div> : <Notice>로그인을 완료하고 내 정보를 확인하고 있습니다.</Notice>}
    </Card>
  </main>;
}
