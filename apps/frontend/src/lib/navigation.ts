

export const conversationTabs = [
  { id: 'messages', label: '대화 원문' },
  { id: 'statistics', label: '통계' },
  { id: 'contradiction', label: '모순 후보' },
  { id: 'opinions', label: '관점별 의견' },
  { id: 'schedules', label: '일정' },
] as const;
export type TabId = typeof conversationTabs[number]['id'];
export type Route = { page: 'login' | 'conversations' | 'upload' | 'health' } |
  { page: 'conversation'; conversationId: string; tab: TabId; messageId?: string };

export function conversationHref(id: string, tab: TabId = 'messages', messageId?: string) {
  return `/conversation/${encodeURIComponent(id)}/${tab}${messageId ? `?message=${encodeURIComponent(messageId)}` : ''}`;
}
