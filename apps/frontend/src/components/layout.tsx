import Link from 'next/link';
import { useEffect, useRef, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { conversationHref, conversationTabs, type Route } from '@/lib/navigation';
import { formatDate, type Conversation } from '@/features/conversations/types';
import { useConversationStore } from '@/features/conversations/provider';
import { AccountMenu } from '@/features/auth/account-menu';

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
  const titles = { login: '로그인', conversations: '내 대화', upload: '대화 업로드', health: '개발 환경', conversation: conversation?.title ?? '불러오는 중입니다' };
  const { conversations } = useConversationStore();
  const recent = conversations.slice(0, 6);
  const activeId = route.page === 'conversation' ? route.conversationId : undefined;
  const people = conversation ? (conversation.participants.length <= 4 ? conversation.participants.map(person => person.name).join(' · ') : `참여자 ${conversation.participants.length}명`) : '';
  return <>
    <Link className="skip-link" href="#main-content" onClick={event => { event.preventDefault(); document.getElementById('main-content')?.focus(); }}>본문으로 이동</Link>
    <div className="app-shell">
      <aside className="app-rail">
        <div className="app-rail-top">
          <Link href="/conversations" className="app-rail-brand">그랬잖아</Link>
          <Link href="/upload" className="app-rail-upload" aria-current={route.page === 'upload' ? 'page' : undefined}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>업로드</Link>
        </div>
        <nav aria-label="주요 메뉴" className="app-rail-nav">
          <Link href="/conversations" aria-current={route.page === 'conversations' ? 'page' : undefined}>내 대화</Link>
        </nav>
        {recent.length > 0 && <div className="app-rail-recent">
          <p className="app-rail-heading">최근 대화</p>
          <ul>{recent.map(item => <li key={item.id}><Link href={conversationHref(item.id)} aria-current={item.id === activeId ? 'page' : undefined}>
            <strong>{item.title}</strong><span>메시지 {item.messageCount.toLocaleString()}개 · {formatDate(item.endDate).slice(5)}</span>
          </Link></li>)}</ul>
        </div>}
        <div className="app-rail-foot"><AccountMenu /><Link className="health-link" href="/health">개발 환경 연결 상태</Link></div>
      </aside>
      <main id="main-content" tabIndex={-1} className="app-main">
        <div className="app-head">
          <div className="app-head-title">
            <h1>{titles[route.page]}</h1>
            {route.page === 'conversation' && conversation && <p>{people} · {formatDate(conversation.startDate)} – {formatDate(conversation.endDate)} · 메시지 {conversation.messageCount.toLocaleString()}개</p>}
          </div>
        </div>
        {route.page === 'conversation' && conversation && <nav className="app-tabs" aria-label="대화 화면">{conversationTabs.map(tab => <Link key={tab.id} href={conversationHref(conversation.id, tab.id)} aria-current={route.tab === tab.id ? 'page' : undefined}>{tab.label}</Link>)}</nav>}
        {children}
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
