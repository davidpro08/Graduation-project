'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useConversation, useConversationStore } from '@/features/conversations/provider';
import { useAuth } from '@/features/auth/provider';
import { Skeleton } from '@/components/ui/skeleton';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, Empty, Shell } from '@/components/layout';
import { useRoute } from '@/lib/use-route';
import { ConversationList, HealthPage, LoginPage, UploadPage } from '@/views/workspace';
import { ContradictionPage, MessagesPage, OpinionsPage, SchedulesPage } from '@/views/conversation';
import { StatisticsPage } from '@/features/conversations/statistics';

export function App() {
  const route = useRoute();
  const { addConversation } = useConversationStore();
  const auth=useAuth();
  const {conversation,loading,error,notFound:missing,reload}=useConversation(route.page==='conversation'?route.conversationId:undefined);
  if (route.page === 'login') return <LoginPage />;
  if(route.page!=='health' && (!auth.ready || !auth.signedIn))return <Shell route={route}><Card>{!auth.ready?<Skeleton className="h-40 w-full"/>:<><Empty title="로그인이 필요합니다">로그인한 계정에 대화를 보관하고 다시 조회할 수 있습니다.</Empty><Button asChild><Link href="/login">로그인</Link></Button></>}</Card></Shell>;
  if(route.page==='conversation' && missing)notFound();
  return <Shell route={route} conversation={conversation}>
    {route.page === 'conversations' && <ConversationList />}
    {route.page === 'upload' && <UploadPage onAdd={addConversation} />}
    {route.page === 'health' && <HealthPage />}
    {route.page === 'conversation' && (loading?<div role="status" className="stack"><p>불러오는 중입니다</p><Skeleton className="h-64 w-full"/></div>:error?<Card><Notice tone="error">{error}</Notice><Button variant="outline" onClick={reload}>다시 조회</Button><Button asChild><Link href="/conversations">내 대화로 돌아가기</Link></Button></Card>:conversation ? <div key={`${conversation.id}-${route.tab}`} className="stack">
      {route.tab === 'messages' && <MessagesPage key={route.messageId??'all'} conversation={conversation} messageId={route.messageId} />}
      {route.tab === 'statistics' && <StatisticsPage conversation={conversation} />}
      {route.tab === 'contradiction' && <ContradictionPage conversation={conversation} />}
      {route.tab === 'opinions' && <OpinionsPage />}
      {route.tab === 'schedules' && <SchedulesPage conversation={conversation} />}
    </div> : null)}
  </Shell>;
}
