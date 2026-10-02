'use client';

import Link from 'next/link';
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
  const {conversation,loading,error,reload}=useConversation(route.page==='conversation'?route.conversationId:undefined);
  if (route.page === 'login') return <LoginPage />;
  if(route.page!=='health' && (!auth.ready || !auth.signedIn))return <Shell route={route}><Card>{!auth.ready?<Skeleton className="h-40 w-full"/>:<><Empty title="로그인이 필요합니다">로그인한 계정에 대화를 보관하고 다시 조회할 수 있습니다.</Empty><Button asChild><Link href="/login">로그인</Link></Button></>}</Card></Shell>;
  return <Shell route={route} conversation={conversation}>
    {route.page === 'conversations' && <ConversationList />}
    {route.page === 'upload' && <UploadPage onAdd={addConversation} />}
    {route.page === 'health' && <HealthPage />}
    {route.page === 'conversation' && (loading?<Skeleton className="h-64 w-full"/>:error?<Card><Notice tone="error">{error}</Notice><Button variant="outline" onClick={reload}>다시 조회</Button><Button asChild><Link href="/conversations">내 대화로 돌아가기</Link></Button></Card>:conversation ? <div key={`${conversation.id}-${route.tab}`} className="stack">
      {route.tab === 'messages' && <MessagesPage conversation={conversation} messageId={route.messageId} />}
      {route.tab === 'statistics' && <StatisticsPage conversation={conversation} />}
      {route.tab === 'contradiction' && <ContradictionPage />}
      {route.tab === 'opinions' && <OpinionsPage />}
      {route.tab === 'schedules' && <SchedulesPage />}
    </div> : <Card><Empty title="대화를 찾을 수 없습니다">삭제되었거나 접근할 수 없는 대화입니다.</Empty><Button asChild><Link href="/conversations">내 대화로 돌아가기</Link></Button></Card>)}
  </Shell>;
}
