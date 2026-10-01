'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import { demoConversations, initialSchedules, type Conversation, type SavedSchedule } from './demo';

interface DemoStore {
  conversations: Conversation[];
  schedules: SavedSchedule[];
  addConversation: (title: string) => string;
  deleteConversation: (id: string) => void;
  saveSchedule: (schedule: SavedSchedule) => void;
}
const DemoContext = createContext<DemoStore | null>(null);

export function DemoProvider({ children }: { children: ReactNode }) {
  const [conversations, setConversations] = useState(demoConversations);
  const [schedules, setSchedules] = useState(initialSchedules);
  function addConversation(title: string) {
    const id = crypto.randomUUID();
    setConversations(items => [...items, { ...demoConversations[0], id, title }]);
    return id;
  }
  function deleteConversation(id: string) {
    setConversations(items => items.filter(item => item.id !== id));
    setSchedules(items => items.filter(item => item.conversationId !== id));
  }
  function saveSchedule(schedule: SavedSchedule) {
    setSchedules(items => [...items.filter(item => item.id !== schedule.id), schedule]);
  }
  return <DemoContext.Provider value={{ conversations, schedules, addConversation, deleteConversation, saveSchedule }}>{children}</DemoContext.Provider>;
}

export function useDemoStore() {
  const store = useContext(DemoContext);
  if (!store) throw new Error('DemoProvider가 필요합니다.');
  return store;
}
