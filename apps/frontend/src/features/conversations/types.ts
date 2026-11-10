export interface Participant { id: string; name: string; colorIndex: number }
export interface Message { id: string; sequence: number; participantId: string|null; speaker: string; date: string; time: string; text: string; kind: 'text'|'attachment'|'system' }
export interface Conversation { id: string; title: string; participants: Participant[]; messageCount: number; startDate: string; endDate: string; createdAt: string; warnings: string[] }
export interface MessagePage { items: Message[]; total: number; page: number; pageSize: number }
export interface ChatFilter { messageId?: string; from?: string; to?: string; participantId?: string; search?: string; page?: number }
export interface Statistics {
  messageCount: number; textCount: number; participantCount: number; characterCount: number;
  participants: { id: string; name: string; colorIndex: number; count: number; textCount: number; characters: number; shortCount: number; nightCount: number; questionCount: number }[];
  daily: {date:string;count:number}[]; hourly: {hour:number;count:number}[];
}
export function formatDate(date: string) { return date.replaceAll('-', '.'); }
