import type { AuthUser } from '../auth/auth.types';
import type { ChatFilter, ChatUpload, Conversation, MessagePage, Statistics } from './conversation.types';
export const CONVERSATIONS = Symbol('CONVERSATIONS');
export interface ConversationRepository {
  list(user: AuthUser, page: number, search?: string): Promise<{ items: Conversation[]; total: number }>;
  find(user: AuthUser, id: string): Promise<Conversation>;
  sourceHash(user: AuthUser, id: string): Promise<string | null>;
  create(user: AuthUser, upload: ChatUpload): Promise<void>;
  remove(user: AuthUser, id: string): Promise<void>;
  messages(user: AuthUser, id: string, filter: ChatFilter): Promise<MessagePage>;
  statistics(user: AuthUser, id: string, filter: ChatFilter): Promise<Statistics>;
}
export const ORIGINAL_FILES = Symbol('ORIGINAL_FILES');
export interface OriginalFiles {
  put(user: AuthUser, path: string, content: Buffer): Promise<void>;
  remove(user: AuthUser, path: string): Promise<void>;
}
