export interface Message {
  id: string;
  speaker: string;
  date: string;
  time: string;
  text: string;
}

export interface Conversation {
  id: string;
  title: string;
  participants: string[];
  messages: Message[];
}

// 합성 예시만 제공한다. 업로드한 파일이나 서버 응답으로 취급하지 않는다.
export const demoConversations: Conversation[] = [
  {
    id: 'team', title: '팀 프로젝트 대화', participants: ['A', 'B', 'C'],
    messages: [
      { id: 'team-1', speaker: 'A', date: '2026-09-29', time: '09:00', text: '제가 금요일까지 제출할게요.' },
      { id: 'team-2', speaker: 'B', date: '2026-09-29', time: '09:05', text: '좋아요. 자료는 목요일에 공유할게요.' },
      { id: 'team-3', speaker: 'C', date: '2026-09-29', time: '09:10', text: '10월 1일 오후 3시에 팀 회의해요.' },
      { id: 'team-4', speaker: 'A', date: '2026-09-30', time: '09:00', text: '제가 제출하기로 한 적은 없어요.' },
      { id: 'team-5', speaker: 'B', date: '2026-09-30', time: '09:03', text: '어제 이야기한 내용을 함께 확인해볼까요?' },
    ],
  },
  {
    id: 'study', title: '스터디 대화', participants: ['A', 'B'],
    messages: [
      { id: 'study-1', speaker: 'A', date: '2026-09-28', time: '18:00', text: '이번 주에는 각자 복습할까요?' },
      { id: 'study-2', speaker: 'B', date: '2026-09-28', time: '18:05', text: '좋아요. 다음 모임은 나중에 정해요.' },
    ],
  },
];

export interface SavedSchedule {
  id: string;
  conversationId: string;
  title: string;
  date: string;
  time: string;
  messageId: string;
}

export const initialSchedules: SavedSchedule[] = [
  { id: 'meeting', conversationId: 'team', title: '팀 회의', date: '2026-10-01', time: '15:00', messageId: 'team-3' },
];

export function formatDate(date: string) {
  return date.replaceAll('-', '.');
}
