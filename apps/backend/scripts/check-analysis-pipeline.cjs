// 실제 JEV·Qwen과 운영 분석 서비스를 검증한다. DB는 합성 메모리 저장소를 사용한다.
require('reflect-metadata');
const {NestFactory}=require('@nestjs/core');
const {randomUUID}=require('node:crypto');
const {resolve}=require('node:path');
const {existsSync}=require('node:fs');
const {AiModule}=require('../dist/ai/ai.module');
const {JevService}=require('../dist/ai/jev.service');
const {QwenHttp}=require('../dist/analyses/qwen.http');
const {AnalysesService}=require('../dist/analyses/analyses.service');
const env=resolve(__dirname,'../../../.env');if(existsSync(env))process.loadEnvFile(env);
const messages=[
  ['A','제가 보고서 제출을 맡겠습니다. 제가 제출 담당인 것으로 확정해 주세요.'],
  ['B','네, 제출 담당은 A로 확정했습니다.'],
  ['A','저는 보고서 제출을 맡겠다고 말한 적이 전혀 없습니다.'],
  ['B','2026년 10월 9일 금요일 오후 3시에 도서관에서 회의합시다.'],
  ['A','네, 그 시간에 도서관에서 만나요.'],
].map(([speaker,text],sequence)=>({id:randomUUID(),sequence,speaker,text,date:'2026-10-02',time:'10:00',kind:'text',participantId:null}));
async function main(){
  const app=await NestFactory.createApplicationContext(AiModule,{logger:false,abortOnError:false});
  try{
    const jobs=new Map();
    const repo={create:async(_user,id,conversationId,analysisType)=>{const row={id,conversationId,analysisType,status:'pending',result:null,metadata:{}};jobs.set(id,row);return {...row};},latest:async()=>null,find:async(_user,id)=>({...jobs.get(id)}),state:async(_user,id,status,errorCode)=>Object.assign(jobs.get(id),{status,errorCode}),complete:async(_user,id,items,metadata)=>Object.assign(jobs.get(id),{status:'completed',result:{items},metadata})};
    const chats={find:async()=>({}),messages:async()=>({items:messages,total:messages.length,pageSize:200})};
    const service=new AnalysesService(repo,new QwenHttp(),chats,app.get(JevService));
    for(const type of ['contradiction','schedule']){
      const user={id:randomUUID(),token:'synthetic'};const started=performance.now();
      const job=await service.create(user,randomUUID(),type,true);
      let current;
      do{await new Promise(resolve=>setTimeout(resolve,200));current=await service.find(user,job.id);}while(['pending','processing'].includes(current.status));
      console.log(JSON.stringify({type,status:current.status,errorCode:current.errorCode,result:current.result,metadata:current.metadata,milliseconds:Math.round(performance.now()-started)}));
      if(current.status!=='completed'||!current.result.items.length)throw Error('synthetic candidate missing');
    }
  }finally{await app.close();}
}
void main().catch(()=>{console.error('합성 분석 파이프라인 검증 실패: 학교 서버·JEV 설정·오류 코드를 확인하세요.');process.exitCode=1;});
