import { notFound } from 'next/navigation';
import { App } from '@/App';
import { conversationTabs } from '@/lib/navigation';

export default async function Page({ params }: { params: Promise<{ conversationId: string; tab: string }> }) {
  const { tab } = await params;
  if (!conversationTabs.some(item => item.id === tab)) notFound();
  return <App />;
}
