'use client';

import Link from 'next/link';
import { useDemoStore } from '@/features/conversations/provider';
import { Button } from '@/components/ui/button';
import { Card, Empty, Shell } from '@/components/layout';
import { useRoute } from '@/lib/use-route';
import { ConversationList, HealthPage, LoginPage, UploadPage } from '@/views/workspace';
import { ContradictionPage, MessagesPage, OpinionsPage, SchedulesPage, StatisticsPage } from '@/views/conversation';

export function App() {
  const route = useRoute();
  const { conversations, schedules, addConversation, deleteConversation, saveSchedule } = useDemoStore();
  const conversation = route.page === 'conversation' ? conversations.find(item => item.id === route.conversationId) : undefined;
  if (route.page === 'login') return <LoginPage />;
  return <Shell route={route} conversation={conversation}>
    {route.page === 'conversations' && <ConversationList conversations={conversations} onDelete={deleteConversation} />}
    {route.page === 'upload' && <UploadPage onAdd={addConversation} />}
    {route.page === 'health' && <HealthPage />}
    {route.page === 'conversation' && (conversation ? <div key={`${conversation.id}-${route.tab}`} className="stack">
      {route.tab === 'messages' && <MessagesPage conversation={conversation} messageId={route.messageId} />}
      {route.tab === 'statistics' && <StatisticsPage conversation={conversation} />}
      {route.tab === 'contradiction' && <ContradictionPage conversation={conversation} />}
      {route.tab === 'opinions' && <OpinionsPage conversation={conversation} />}
      {route.tab === 'schedules' && <SchedulesPage conversation={conversation} schedules={schedules} onSave={saveSchedule} />}
    </div> : <Card><Empty title="대화를 찾을 수 없습니다">삭제되었거나 현재 탭에 없는 대화입니다.</Empty><Button asChild><Link href="/conversations">내 대화로 돌아가기</Link></Button></Card>)}
  </Shell>;
}
