import { Suspense, type ReactNode } from 'react';
import type { Metadata } from 'next';
import { DemoProvider } from '@/features/conversations/provider';
import '../index.css';

export const metadata: Metadata = { title: '그랬잖아 · 채팅 기록 기반 도우미', description: '대화 기록에서 근거를 살펴보고 서로 다른 관점을 이해합니다.' };
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="ko"><body><DemoProvider><Suspense fallback={<main className="login-page" role="status">화면을 준비하고 있습니다.</main>}>{children}</Suspense></DemoProvider></body></html>;
}
