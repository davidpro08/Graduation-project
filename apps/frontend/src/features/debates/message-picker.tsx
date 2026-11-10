import { useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { Card, Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getMessages } from '@/features/conversations/client';
import { useQueryResult } from '@/features/conversations/hooks';
import { QueryFilters, PageControls } from '@/features/conversations/filters';
import type { Conversation, Message, ChatFilter } from '@/features/conversations/types';
export function MessagePicker({conversation,value,onChange,disabled=false}:{conversation:Conversation;value:Message[];onChange:(messages:Message[])=>void;disabled?:boolean}){
 const [filter,setFilter]=useState<ChatFilter>({page:1});
 const query=useQueryResult(JSON.stringify(['message-picker',conversation.id,filter]),signal=>getMessages(conversation.id,filter,signal));
 const toggle=(message:Message)=>{if(disabled)return;if(value.some(m=>m.id===message.id))onChange(value.filter(m=>m.id!==message.id));else if(value.length<20)onChange([...value,message]);};
 return <Card title="문서에 보낼 대화 선택"><p className="small muted">발언을 눌러 담거나 해제하세요. 최대20개만 전송하며, 검색·조건을 바꿔도 담은 발언은 유지됩니다. 선택하지 않으면 질문만으로 문서를 만듭니다.</p>
 <fieldset disabled={disabled} className="stack"><label>대화 검색<Input type="search" placeholder="관련 단어를 입력하세요" maxLength={100} value={filter.search??''} onChange={e=>setFilter({...filter,search:e.target.value,page:1})}/></label><QueryFilters filter={filter} onChange={setFilter} participants={conversation.participants} startDate={conversation.startDate} endDate={conversation.endDate}/></fieldset>
 <div className="message-picker-grid"><section className="stack"><h3>대화 목록</h3>{query.loading&&<p role="status">대화를 불러오는 중…</p>}{query.error&&<><Notice tone="error">{query.error}</Notice><Button variant="outline" onClick={query.retry}>다시 조회</Button></>}
 <div className="message-picker-list" aria-label="선택 가능한 대화">{!query.loading&&!query.error&&query.data?.items.map(m=>{const selected=value.some(v=>v.id===m.id);return <button type="button" className={`message-select-button${selected?' selected':''}`} key={m.id} aria-pressed={selected} disabled={disabled||m.kind!=='text'||(!selected&&value.length>=20)} onClick={()=>toggle(m)}><span className="message-select-heading"><strong>{m.speaker}</strong><span>{m.date} {m.time}</span>{selected?<Check size={17}/>:<Plus size={17}/>}</span><span className="message-text">{m.text}</span></button>;})}{!query.loading&&!query.error&&!query.data?.items.length&&<p className="small muted">조건에 맞는 대화가 없습니다.</p>}</div>
 {query.data&&<PageControls page={filter.page??1} total={query.data.total} pageSize={query.data.pageSize} disabled={disabled||query.loading} onChange={page=>setFilter({...filter,page})}/>}</section>
 <section className="stack"><div className="actions"><h3>보낼 대화 · {value.length}/20</h3><Button type="button" variant="ghost" disabled={disabled||!value.length} onClick={()=>onChange([])}>전체 비우기</Button></div>{value.length===20&&<Notice>20개를 모두 담았습니다. 다른 대화를 담으려면 먼저 하나를 해제하세요.</Notice>}<div className="message-picker-list">{value.map(m=><article className="document-source" key={m.id}><div className="message-select-heading"><strong>{m.speaker}</strong><Button type="button" variant="ghost" disabled={disabled} aria-label={`${m.speaker} 발언 선택 해제`} onClick={()=>toggle(m)}><X size={16}/></Button></div><p className="small muted">{m.date} {m.time}</p><p className="message-text">{m.text}</p></article>)}{!value.length&&<p className="small muted">왼쪽에서 관련 발언을 직접 담아 주세요.</p>}</div><p className="small muted">긴 발언은 빠른 처리를 위해 앞부분만 문서 작성에 참고할 수 있습니다. 원문은 그대로 보관됩니다.</p></section></div></Card>;
}
