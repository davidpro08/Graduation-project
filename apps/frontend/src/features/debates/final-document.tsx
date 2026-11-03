import { useEffect, useState } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Notice } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { authenticatedRequest } from '@/lib/api';
import type { DocumentEdit, Job } from './types';

export function MarkdownPreview({ text }: { text:string }) {
  return <div className="final-document-preview"><Markdown remarkPlugins={[remarkGfm]} skipHtml disallowedElements={['img']} components={{a:({href,children})=><a href={href} target="_blank" rel="noopener noreferrer">{children}</a>}}>{text}</Markdown></div>;
}

/** 조합은 서버의 한 구현을 사용한다. 직접 편집한 문서는 자동 조합이 덮어쓰지 않는다. */
export function useDocumentComposition(job:Job,draft:DocumentEdit) {
  const input=JSON.stringify({...draft,markdown:undefined,markdownEdited:undefined});
  const [composed,setComposed]=useState(()=>({key:job.document?.markdown?input:'',markdown:job.document?.markdown??'',error:''}));
  const key=composed.key,id=job.id;
  useEffect(()=>{
    if(key===input)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      void authenticatedRequest<{markdown:string}>(`/persona-debates/${id}/document/compose`,{method:'POST',json:JSON.parse(input),signal:controller.signal})
        .then(data=>{if(!controller.signal.aborted)setComposed({key:input,markdown:data.markdown,error:''});})
        .catch(cause=>{if(!controller.signal.aborted)setComposed({key:input,markdown:'',error:cause instanceof Error?cause.message:'최종 문서를 조합하지 못했습니다.'});});
    },350);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[id,input,key]);
  return {markdown:draft.markdownEdited?draft.markdown??'':composed.markdown,candidate:composed.markdown,pending:composed.key!==input,error:composed.error};
}

export function FinalDocumentPanel({value,candidate,pending,error,manual,readOnly,disabled,onEdit,onRebuild}:{
  value:string;candidate:string;pending:boolean;error:string;manual:boolean;readOnly:boolean;disabled:boolean;
  onEdit:(text:string)=>void;onRebuild:()=>void;
}){
  const [preview,setPreview]=useState(readOnly);
  return <section className="final-document stack" aria-label="최종 판단 문서">
    <div className="document-source-heading"><div><p className="eyebrow">2·3차 통합 검토</p><h3>AI에 보낼 최종 문서</h3></div><div className="actions"><Button type="button" variant={!preview?'default':'outline'} onClick={()=>setPreview(false)}>마크다운</Button><Button type="button" variant={preview?'default':'outline'} onClick={()=>setPreview(true)}>미리보기</Button></div></div>
    <p className="small muted">이 문서의 내용이 그대로 의견 모델에 전달됩니다. 위 조건과 자료를 조합한 뒤 직접 수정할 수 있습니다. 답변 유형·선택지는 별도의 응답 수집 설정도 함께 적용됩니다.</p>
    {pending&&<p role="status" className="small muted">변경한 조건을 문서로 조합하고 있습니다…</p>}
    {error&&<Notice tone="error">{error}</Notice>}
    {manual&&!readOnly&&<Notice>직접 편집한 문서를 유지하고 있습니다. 위 항목을 바꿔도 덮어쓰지 않습니다. 새 조건·조사 결과를 자동으로 반영하려면 아래 버튼으로 다시 조합하세요.</Notice>}
    {!readOnly&&manual&&<Button type="button" variant="outline" disabled={disabled||pending||!!error||!candidate} onClick={onRebuild}>위 조건·조사로 다시 조합하기 (직접 편집 내용 교체)</Button>}
    {preview?<MarkdownPreview text={value}/>:<label>최종 마크다운<textarea className="final-document-input" rows={24} value={value} maxLength={10000} readOnly={readOnly} disabled={disabled||pending} onChange={e=>onEdit(e.target.value)} spellCheck={false}/></label>}
    <p className="small muted">{value.length.toLocaleString()} / 10,000자 · {manual?'직접 편집본':'조건·조사 조합본'}</p>
  </section>;
}
