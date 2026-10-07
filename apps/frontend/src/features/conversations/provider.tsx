'use client';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from '@/features/auth/provider';
import { ApiError } from '@/lib/api';
import { deleteConversation, getConversation, listConversations, uploadConversation } from './client';
import type { Conversation } from './types';
interface ConversationStore {
  conversations: Conversation[]; loading: boolean; error: string; total:number; page:number;
  setPage:(page:number)=>void; reload:()=>void;
  search:string; setSearch:(search:string)=>void;
  addConversation:(title:string,file:File,uploadId:string)=>Promise<string>;
  deleteConversation:(id:string)=>Promise<void>;
}
const ConversationContext=createContext<ConversationStore|null>(null);
export function ConversationProvider({children}:{children:ReactNode}) {
  const {userId}=useAuth();const owner=useRef(userId);owner.current=userId;
  const [result,setResult]=useState<{owner:string|null;items:Conversation[];total:number}>({owner:null,items:[],total:0});
  const [page,setPage]=useState(1);const [version,setVersion]=useState(0);const [loading,setLoading]=useState(false);const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  useEffect(() => { setPage(1);setSearch('');setError(''); },[userId]);
  useEffect(() => {
    if (!userId) return;
    const controller=new AbortController();setLoading(true);setError('');
    const timer=setTimeout(()=>{listConversations(page,search,controller.signal).then(data=>{if(!controller.signal.aborted)setResult({owner:userId,...data});})
      .catch(cause=>{if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'대화를 불러오지 못했습니다.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});},180);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[userId,page,version,search]);
  const reload=useCallback(()=>setVersion(value=>value+1),[]);
  async function addConversation(title:string,file:File,uploadId:string) {
    const startedOwner=userId;const data=await uploadConversation(title,file,uploadId);
    if(owner.current!==startedOwner)throw new Error('로그인 계정이 변경되었습니다. 현재 계정의 대화 목록을 확인해 주세요.');
    setPage(1);reload();return data.id;
  }
  async function remove(id:string) { await deleteConversation(id);reload(); }
  return <ConversationContext.Provider value={{conversations:result.owner===userId?result.items:[],total:result.owner===userId?result.total:0,
    loading:!!userId && (loading || result.owner!==userId) && !error,error,page,setPage,search,setSearch:value=>{setSearch(value);setPage(1);},reload,addConversation,deleteConversation:remove}}>{children}</ConversationContext.Provider>;
}
export function useConversationStore(){const value=useContext(ConversationContext);if(!value)throw new Error('ConversationProvider가 필요합니다.');return value;}
export function useConversation(id:string|undefined) {
  const {userId}=useAuth();
  const [result,setResult]=useState<{owner:string;id:string;version:number;conversation?:Conversation;error?:string;notFound?:boolean}|null>(null);
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    if(!id || !userId)return;
    const controller=new AbortController();
    getConversation(id,controller.signal).then(conversation=>{if(!controller.signal.aborted)setResult({owner:userId,id,version,conversation});})
      .catch(cause=>{if(!controller.signal.aborted)setResult({owner:userId,id,version,
        error:cause instanceof Error?cause.message:'대화를 불러오지 못했습니다.',notFound:cause instanceof ApiError && cause.status===404});});
    return ()=>controller.abort();
  },[id,userId,version]);
  // 현재 계정·대화·재조회 요청의 결과만 표시하여 이전 404가 다음 화면에 남지 않게 한다.
  const current=result?.owner===userId && result.id===id && result.version===version?result:null;
  return {conversation:current?.conversation,error:current?.error ?? '',notFound:current?.notFound ?? false,
    loading:!!id && !current,reload:()=>setVersion(value=>value+1)};
}
