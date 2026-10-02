const { before, after, test }=require('node:test');
const assert=require('node:assert/strict');
const { randomUUID }=require('node:crypto');
const { Test }=require('@nestjs/testing');
const request=require('supertest');
const { AppModule }=require('../dist/app.module');
const { configureApp }=require('../dist/configure-app');
const { AuthService }=require('../dist/auth/auth.service');
const { SupabaseService }=require('../dist/supabase/supabase.service');
const { CONVERSATIONS, ORIGINAL_FILES }=require('../dist/conversations/conversation.repository');
const { KakaoParser, decodeChat }=require('../dist/conversations/kakao.parser');
const { NotFoundException }=require('@nestjs/common');
const parser=new KakaoParser();
const pc='합성 테스트 대화\n저장한 날짜 : 2026-10-03\n--------------- 2026년 9월 29일 화요일 ---------------\n[A] [오전 12:00] 첫 줄\n둘째 줄\n[A] [오후 12:00] 네\n[B] [오후 11:59] 사진\nB님이 나갔습니다.\n';
test('PC 날짜·자정·정오·멀티라인·첨부·시스템을 구분하고 원문 순서를 유지한다',()=>{
  const result=parser.parse(Buffer.from(pc));
  assert.deepEqual(result.messages.map(m=>[m.speaker,m.time,m.kind,m.text]),[['A','00:00','text','첫 줄\n둘째 줄'],['A','12:00','text','네'],['B','23:59','attachment','사진'],['시스템','','system','B님이 나갔습니다.']]);
  assert.deepEqual(result.participants.map(p=>[p.name,p.colorIndex]),[['A',0],['B',1]]);
  assert.deepEqual(result.messages.map(m=>m.sequence),[0,1,2,3]);
});
test('모바일 한국어·점 날짜와 발화자 이름의 콜론·중복 시각을 보존한다',()=>{
  const text='2026년 9월 29일 오전 9:00, 팀: A : 안녕\n2026. 9. 29. 오후 1:01, B : 네?\n2026. 9. 29. 오후 1:01, B : 마지막\n줄\n2026년 9월 30일 오전 10:00, B님이 나갔습니다.';
  const result=parser.parse(Buffer.from(text));
  assert.equal(result.messages[0].speaker,'팀: A');assert.equal(result.messages[1].time,'13:01');
  assert.equal(result.messages[2].text,'마지막\n줄');assert.equal(result.messages[3].kind,'system');
});
test('UTF-8 BOM·UTF-16·CP949를 읽는다',()=>{
  assert.equal(parser.parse(Buffer.from('\uFEFF'+pc)).messages.length,4);
  assert.equal(parser.parse(Buffer.concat([Buffer.from([255,254]),Buffer.from(pc,'utf16le')])).messages.length,4);
  assert.equal(decodeChat(Buffer.from([0xb0,0xa1])),'가');
});
test('빈 파일·임의 텍스트·날짜 누락·잘못된 날짜/시간·깨진 메시지를 거절한다',()=>{
  for(const content of ['', 'plain arbitrary text','[A] [오전 9:00] 내용','2026년 2월 30일 오전 9:00, A : 내용','2026년 9월 29일 오후 13:00, A : 내용',pc+'[B] [없는 시간] 이건 메시지'])assert.throws(()=>parser.parse(Buffer.from(content)));
});
test('400명에 서로 다른 고정 색상 인덱스를 부여하고 401명은 거절한다',()=>{
  const lines=Array.from({length:400},(_,i)=>`[참여자${i}] [오전 9:00] 안녕`);
  const head='2026년 9월 29일 화요일\n';const parsed=parser.parse(Buffer.from(head+lines.join('\n')));
  assert.equal(new Set(parsed.participants.map(p=>p.colorIndex)).size,400);
  assert.throws(()=>parser.parse(Buffer.from(head+lines.join('\n')+'\n[추가] [오전 9:00] 안녕')));
});

const owner=randomUUID(),other=randomUUID();const stored=new Map(),files=new Map();let app,dbFail=false,removeFail=false,responseLost=false;
const repo={
  async sourceHash(user,id){return stored.get(id)?.owner===user.id?stored.get(id).hash:null;},
  async create(user,upload){if(dbFail)throw new Error('private data');stored.set(upload.id,{owner:user.id,hash:upload.sourceHash,chat:{id:upload.id,title:upload.title,participants:upload.parsed.participants,messageCount:upload.parsed.messages.length,startDate:'2026-09-29',endDate:'2026-09-29',createdAt:'2026-10-03',warnings:upload.parsed.warnings},messages:upload.parsed.messages});if(responseLost)throw new Error('lost response');},
  async find(user,id){if(stored.get(id)?.owner!==user.id)throw new NotFoundException();return stored.get(id).chat;},
  async list(user){const items=[...stored.values()].filter(row=>row.owner===user.id).map(row=>row.chat);return {items,total:items.length};},
  async remove(user,id){await this.find(user,id);stored.delete(id);},
  async messages(user,id){await this.find(user,id);return {items:stored.get(id).messages,total:4,page:1,pageSize:100};},
  async statistics(){return {messageCount:3};}
};
before(async()=>{
  const moduleRef=await Test.createTestingModule({imports:[AppModule]}).overrideProvider(SupabaseService).useValue({})
    .overrideProvider(AuthService).useValue({verify:async token=>({id:token==='other'?other:owner,token})})
    .overrideProvider(CONVERSATIONS).useValue(repo).overrideProvider(ORIGINAL_FILES).useValue({
      put:async(_user,path,buffer)=>files.set(path,buffer),remove:async(_user,path)=>{if(removeFail)throw new Error('storage error');files.delete(path);}
    }).compile();app=moduleRef.createNestApplication();configureApp(app);await app.init();
});
after(async()=>{if(app)await app.close();});
const upload=(id=randomUUID(),content=pc,filename='chat.txt')=>request(app.getHttpServer()).post('/api/conversations').set('Authorization','Bearer own').field('title','합성 대화').field('uploadId',id).attach('file',Buffer.from(content),filename);
test('인증 → 실제 multipart 업로드 → 원문 조회 → 타인 거절 → 원본·DB 삭제',async()=>{
  const id=randomUUID();await upload(id).expect(201);assert.ok(files.has(`${owner}/${id}/original.txt`));
  const messages=await request(app.getHttpServer()).get(`/api/conversations/${id}/messages`).set('Authorization','Bearer own').expect(200);assert.equal(messages.body.items[0].text,'첫 줄\n둘째 줄');
  await request(app.getHttpServer()).get(`/api/conversations/${id}`).set('Authorization','Bearer other').expect(404);
  await request(app.getHttpServer()).delete(`/api/conversations/${id}`).set('Authorization','Bearer other').expect(404);
  await request(app.getHttpServer()).delete(`/api/conversations/${id}`).set('Authorization','Bearer own').expect(204);assert.ok(!stored.has(id));assert.ok(!files.has(`${owner}/${id}/original.txt`));
});
test('업로드 ID 재시도는 중복 저장하지 않고 다른 파일 사용은 거절한다',async()=>{
  const id=randomUUID();await upload(id).expect(201);const before=stored.size;await upload(id).expect(201);assert.equal(stored.size,before);await upload(id,pc+'추가 내용').expect(409);
});
test('DB 실패 시 원본 정리, RPC 응답 유실 시 저장된 원본 보존',async()=>{
  const id=randomUUID();dbFail=true;await upload(id).expect(503);dbFail=false;assert.ok(!files.has(`${owner}/${id}/original.txt`));
  const saved=randomUUID();responseLost=true;await upload(saved).expect(201);responseLost=false;assert.ok(files.has(`${owner}/${saved}/original.txt`));
});
test('원본 삭제 실패는 DB를 유지하고 오류 상세를 노출하지 않으며 재시도로 완료한다',async()=>{
  const id=randomUUID();await upload(id).expect(201);removeFail=true;
  const response=await request(app.getHttpServer()).delete(`/api/conversations/${id}`).set('Authorization','Bearer own').expect(503);
  assert.ok(stored.has(id));assert.ok(!JSON.stringify(response.body).includes('storage error'));removeFail=false;
  await request(app.getHttpServer()).delete(`/api/conversations/${id}`).set('Authorization','Bearer own').expect(204);
});
test('잘못된 파일·제목·날짜·참여자·페이지와 인증 누락을 거절한다',async()=>{
  await upload(randomUUID(),pc,'chat.csv').expect(400);await upload(randomUUID(),'').expect(400);await upload(randomUUID(),'unrecognized').expect(400);
  await request(app.getHttpServer()).post('/api/conversations').expect(401);
  const id=randomUUID();await upload(id).expect(201);
  for(const query of ['from=2026-02-30','from=2026-10-03&to=2026-10-02','page=0','pageSize=201','participantId=invalid'])await request(app.getHttpServer()).get(`/api/conversations/${id}/messages?${query}`).set('Authorization','Bearer own').expect(400);
});
