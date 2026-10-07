'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { conversationTabs, type Route } from './navigation';

export function useRoute(): Route {
  const pathname = usePathname();
  const search = useSearchParams();
  const parts = (pathname ?? '').split('/').filter(Boolean);
  if (parts[0] === 'conversation' && parts[1]) {
    const tab = conversationTabs.find(item => item.id === parts[2])?.id ?? 'messages';
    return { page: 'conversation', conversationId: decodeURIComponent(parts[1]), tab, messageId: search?.get('message') ?? undefined };
  }
  if (parts[0] === 'conversations' || parts[0] === 'upload' || parts[0] === 'health') return { page: parts[0] };
  return { page: 'login' };
}
