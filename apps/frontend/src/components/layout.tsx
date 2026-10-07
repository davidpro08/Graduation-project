import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { conversationHref, conversationTabs, type Route } from '@/lib/navigation';
import type { Conversation } from '@/features/conversations/demo';

export function Card({ title, children, className = '', action }: { title?: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return <section className={`card ${className}`}>
    {(title || action) && <div className="card-heading">{title && <h2>{title}</h2>}{action}</div>}
    {children}
  </section>;
}

export function Notice({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warning' | 'error' | 'success' }) {
  return <p className={`notice notice-${tone}`} role="status">{children}</p>;
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty"><h2>{title}</h2>{children && <p>{children}</p>}</div>;
}

export function Shell({ route, conversation, children }: { route: Route; conversation?: Conversation; children: ReactNode }) {
  const titles = { login: '로그인', conversations: '내 대화', upload: '대화 업로드', health: '개발 환경', conversation: conversation?.title ?? '대화를 찾을 수 없습니다' };
  return <>
    <Link className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>본문으로 이동</Link>
    <header className="topbar"><Link href="/conversations" className="brand">그랬잖아</Link><span className="topbar-note">대화에서 찾는 근거, 함께 이해하는 관점</span><Link href="/login">로그인</Link></header>
    <div className="workspace">
      <aside className="sidebar"><p className="nav-heading">내 공간</p><nav aria-label="주요 메뉴">
        <Link href="/conversations" aria-current={route.page === 'conversations' || route.page === 'conversation' ? 'page' : undefined}>내 대화</Link>
        <Link href="/upload" aria-current={route.page === 'upload' ? 'page' : undefined}>대화 업로드</Link>
      </nav><div className="sidebar-note"><strong>근거를 먼저 확인하세요.</strong><p>AI의 제안은 서로의 대화를 이해하기 위한 참고 자료입니다.</p></div><Link className="health-link" href="/health">개발 환경 연결 상태</Link></aside>
      <main id="main-content" tabIndex={-1} className="main-content">
        <div className="page-heading"><div><p className="eyebrow">그랬잖아 · 대화 기록</p><h1>{titles[route.page]}</h1></div>{route.page === 'conversations' && <Button asChild><Link href="/upload">새 대화 업로드</Link></Button>}</div>
        <p className="demo-label">화면 체험 · 합성 예시 데이터 / 변경은 현재 탭 메모리에만 유지됩니다.</p>
        {route.page === 'conversation' && conversation && <>
          <p className="muted">참여자 {conversation.participants.join(', ')} · 예시 메시지 {conversation.messages.length}개</p>
          <nav className="tabs" aria-label="대화 화면">{conversationTabs.map(tab => <Link key={tab.id} href={conversationHref(conversation.id, tab.id)} aria-current={route.tab === tab.id ? 'page' : undefined}>{tab.label}</Link>)}</nav>
        </>}
        {children}
        <footer>그랬잖아 · 개인의 기억을 대화의 근거와 함께 살펴봅니다.</footer>
      </main>
    </div>
  </>;
}

export function ConfirmDialog({ title, children, onCancel, onConfirm }: { title: string; children: ReactNode; onCancel: () => void; onConfirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="confirm-dialog" aria-labelledby="dialog-title" onCancel={onCancel}>
    <h2 id="dialog-title">{title}</h2><p>{children}</p><div className="actions"><Button variant="outline" autoFocus onClick={onCancel}>취소</Button><Button variant="destructive" onClick={onConfirm}>삭제</Button></div>
  </dialog>;
}
