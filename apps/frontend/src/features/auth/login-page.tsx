'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, Notice } from '@/components/layout';
import { updateNickname } from '@/lib/api';
import { signOut, startOAuth, type LoginProvider } from './client';
import { useAuth } from './provider';

const providers: { id: LoginProvider; label: string; image: string }[] = [
  { id: 'google', label: 'Google로 로그인', image: '/auth/google-signin.png' },
  { id: 'github', label: 'GitHub로 로그인', image: '/auth/github-invertocat-white.svg' },
  { id: 'kakao', label: '카카오 로그인', image: '/auth/kakao-login.svg' },
];

export function LoginPage() {
  const { ready, signedIn, user, error, refreshProfile } = useAuth();
  const [pending, setPending] = useState<LoginProvider | 'save' | 'logout' | null>(null);
  const [notice, setNotice] = useState('');
  const [nickname, setNickname] = useState('');
  const [saved, setSaved] = useState(false);
  async function login(provider: LoginProvider) {
    if (pending) return;
    setPending(provider); setNotice('');
    try { await startOAuth(provider); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : '로그인을 시작하지 못했습니다.'); setPending(null); }
  }
  async function logout() {
    setPending('logout'); setNotice(''); setSaved(false);
    try { await signOut(); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : '로그아웃하지 못했습니다.'); }
    finally { setPending(null); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending('save'); setNotice(''); setSaved(false);
    const value = nickname.trim();
    if ([...value].length < 1 || [...value].length > 30) {
      setNotice('닉네임을 1~30자로 입력해 주세요.'); setPending(null); return;
    }
    try { await updateNickname(value); await refreshProfile(); setSaved(true); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : '닉네임을 저장하지 못했습니다.'); }
    finally { setPending(null); }
  }
  return <main className="login-page" id="main-content">
    <Link className="brand" href="/login">그랬잖아</Link>
    <div className="login-grid"><div className="login-intro"><p className="eyebrow">채팅 기록 기반 대화 도우미</p><h1>기억이 다를 때,<br />대화에서 확인하세요.</h1><p>채팅 기록으로 발언의 근거를 살펴보고<br />다양한 관점에서 대화를 이해하세요.</p><div className="intro-note"><strong>대화의 근거부터, 함께.</strong><p>원문 확인 · 모순 후보 · 관점별 의견 · 일정 정리</p></div></div>
      <Card title={signedIn ? '내 계정' : '로그인'} className="login-card">
        {!ready ? <Notice>로그인 상태를 확인하고 있습니다.</Notice> : signedIn ? <div className="stack">
          <p>{user ? `${user.nickname ?? '사용자'}님, 로그인되었습니다.` : '로그인되었습니다. 사용자 정보를 확인하고 있습니다.'}</p>
          {user && <><p className="small muted">{user.email ?? '연결된 계정'} · {user.providers.join(', ')}</p>
            <form onSubmit={save} className="stack"><label>닉네임<input value={nickname} onChange={event => setNickname(event.target.value)} placeholder={user.nickname ?? '사용할 닉네임을 입력하세요'} autoComplete="nickname" required /></label><Button disabled={!!pending} type="submit">{pending === 'save' ? '저장 중…' : '닉네임 저장'}</Button></form></>}
          {error && <><Notice tone="error">{error}</Notice><Button variant="outline" disabled={!!pending} onClick={() => { void refreshProfile().catch(cause => setNotice(cause instanceof Error ? cause.message : '사용자 정보를 확인하지 못했습니다.')); }}>내 정보 다시 확인</Button></>}
          <Button asChild><Link href="/conversations">대화 화면으로 이동</Link></Button>
          <Button variant="outline" disabled={!!pending} onClick={() => { void logout(); }}>{pending === 'logout' ? '로그아웃 중…' : '로그아웃'}</Button>
        </div> : <>
          <p className="muted">사용하는 계정으로 간편하게 시작하세요.</p>
          <div className="oauth-buttons" aria-busy={!!pending}>{providers.map(provider =>
            <button className={`oauth-button oauth-${provider.id}`} type="button" key={provider.id} aria-label={provider.label} disabled={!!pending} onClick={() => { void login(provider.id); }}>
              {provider.id === 'github' ? <><Image src={provider.image} width={24} height={24} alt="" /><span>{provider.label}</span></> : <Image src={provider.image} width={provider.id === 'google' ? 378 : 224} height={provider.id === 'google' ? 80 : 46} alt={provider.label} unoptimized />}
            </button>)}</div>
          {pending && <p className="small muted" role="status">로그인 페이지로 이동하고 있습니다.</p>}
          <p className="small muted">처음 로그인하면 계정이 자동으로 생성됩니다.</p>
          {error && <Notice tone="error">{error}</Notice>}
        </>}
        {notice && <Notice tone="error">{notice}</Notice>}{saved && <Notice tone="success">닉네임을 저장했습니다.</Notice>}
        <div className="divider" /><p className="small muted">로그인 없이 합성 데이터로 화면을 살펴볼 수도 있습니다.</p>
        <Button asChild variant="secondary"><Link href="/conversations">화면 체험하기</Link></Button>
      </Card>
    </div>
    <p className="small muted">로그인과 사용자 프로필은 실제 서비스에 연결됩니다. 대화 업로드·저장·AI 분석은 현재 합성 데이터 체험입니다.</p>
  </main>;
}
