import { authenticatedRequest } from '@/lib/api';
import type { ChatFilter, Conversation, MessagePage, Statistics } from './types';
function query(filter: ChatFilter) {
  const params=new URLSearchParams();
  for (const [key,value] of Object.entries(filter)) if (value!==undefined && value!=='') params.set(key,String(value));
  return params.toString();
}
export const listConversations=(page=1,search='',signal?:AbortSignal) => authenticatedRequest<{items:Conversation[];total:number}>(`/conversations?${query({page,search})}`,{signal});
export const getConversation=(id:string,signal?:AbortSignal) => authenticatedRequest<Conversation>(`/conversations/${id}`,{signal});
export const getMessages=(id:string,filter:ChatFilter,signal?:AbortSignal) => authenticatedRequest<MessagePage>(`/conversations/${id}/messages?${query(filter)}`,{signal});
export const getStatistics=(id:string,filter:ChatFilter,signal?:AbortSignal) => authenticatedRequest<Statistics>(`/conversations/${id}/statistics?${query(filter)}`,{signal});
export const deleteConversation=(id:string) => authenticatedRequest<void>(`/conversations/${id}`,{method:'DELETE'});
export function uploadConversation(title:string,file:File,uploadId:string) {
  const body=new FormData();body.set('title',title);body.set('uploadId',uploadId);body.set('file',file);
  return authenticatedRequest<Conversation>('/conversations',{method:'POST',body});
}
