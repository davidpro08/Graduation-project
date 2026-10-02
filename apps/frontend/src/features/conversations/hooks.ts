import { useEffect, useState } from 'react';
export function useQueryResult<T>(key:string,load:(signal:AbortSignal)=>Promise<T>,enabled=true) {
  const [state,setState]=useState<{key:string;data?:T;error:string;loading:boolean}>({key:'',error:'',loading:true});
  const [version,setVersion]=useState(0);
  useEffect(()=>{
    if (!enabled) return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      setState(previous=>({...previous,key,error:'',loading:true}));
      load(controller.signal).then(data=>{if(!controller.signal.aborted)setState({key,data,error:'',loading:false});})
        .catch(cause=>{if(!controller.signal.aborted)setState({key,error:cause instanceof Error?cause.message:'조회하지 못했습니다.',loading:false});});
    },180);
    return ()=>{clearTimeout(timer);controller.abort();};
    // key는 조회 함수에 사용한 모든 값을 포함한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[key,version,enabled]);
  return {data:state.data,error:state.key===key?state.error:'',loading:enabled && (state.loading || state.key!==key),retry:()=>setVersion(value=>value+1)};
}
export function useReducedMotion(){const [reduced,setReduced]=useState(false);useEffect(()=>{const query=window.matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(query.matches);update();query.addEventListener('change',update);return ()=>query.removeEventListener('change',update);},[]);return reduced;}
