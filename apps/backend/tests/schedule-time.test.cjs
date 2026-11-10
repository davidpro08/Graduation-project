const {test}=require('node:test');
const assert=require('node:assert/strict');
const {suggestTime}=require('../dist/analyses/schedule-time');
const {AnalysesService}=require('../dist/analyses/analyses.service');
test('금요일 4시반~5시반은 메시지 시점의 해당 주·오후 제안과 확인 안내',()=>{
  const result=suggestTime('금요일 4시반 ~ 5시반에 회의','2026-09-11','09:00');
  assert.equal(result.date,'2026-09-11');assert.equal(result.time,'16:30');assert.equal(result.endTime,'17:30');assert.ok(result.warnings.some(text=>text.includes('오전·오후')));
});
test('메시지 시점에서 지정된 요일·시각이 지나면 다음 주, 현재 실행 시각은 사용하지 않음',()=>{
  assert.equal(suggestTime('금요일 오후 4시반~5시반','2026-09-11','18:00').date,'2026-09-18');
  assert.equal(suggestTime('금요일 오후 4시반','2026-09-13','09:00').date,'2026-09-18');
  assert.equal(suggestTime('금요일 오후 4시반','2026-09-09','09:00').date,'2026-09-11');
});
test('이번 주·다음 주·다다음 주·지난 주를 월요일 기준으로 구분',()=>{
  for(const [prefix,date] of [['이번 주','2026-09-11'],['다음 주','2026-09-18'],['다다음 주','2026-09-25'],['지난 주','2026-09-04']])assert.equal(suggestTime(`${prefix} 금요일 오후 4시`,'2026-09-09','09:00').date,date);
});
test('내일·모레와 다음 달의 연도 경계를 계산',()=>{
  assert.equal(suggestTime('내일 오전 9시','2026-12-31','14:00').date,'2027-01-01');
  assert.equal(suggestTime('모레 오후 2시','2026-12-31','14:00').date,'2027-01-02');
  assert.equal(suggestTime('다음 달 5일 오후 2시','2026-12-31','14:00').date,'2027-01-05');
  assert.equal(suggestTime('5일 오후 2시','2026-12-31','14:00').date,'2027-01-05');
});
test('명시한 과거 날짜는 다음 주·다음 해로 임의 이동하지 않음',()=>{
  assert.equal(suggestTime('2026년 9월 11일 오후 4시','2026-09-20','12:00').date,'2026-09-11');
  assert.equal(suggestTime('9월 11일 오후 4시','2026-09-20','12:00').date,'2026-09-11');
});
test('오전 자정·오후 정오·24시간 표기·분 단위 범위',()=>{
  assert.equal(suggestTime('내일 오전 12시','2026-09-11','10:00').time,'00:00');
  assert.equal(suggestTime('내일 오후 12시','2026-09-11','10:00').time,'12:00');
  const result=suggestTime('금요일 16:35~17:45','2026-09-11','10:00');assert.equal(result.time,'16:35');assert.equal(result.endTime,'17:45');assert.equal(result.warnings.length,0);
});
test('다른 두 시각을 범위로 합치지 않으며 자정 넘김·잘못된 날짜는 확인 필요',()=>{
  assert.equal(suggestTime('금요일 오후 4시 또는 5시','2026-09-11','10:00').endTime,null);
  assert.equal(suggestTime('내일 밤 11시~오전 1시','2026-09-11','10:00').endTime,null);
  assert.equal(suggestTime('2026년 2월 30일 오후 3시','2026-02-01','10:00').date,null);
  assert.equal(suggestTime('다음 달 31일 오후 3시','2026-03-01','10:00').date,null);
  assert.equal(suggestTime('언젠가 만나자','2026-09-11','10:00').time,null);
});
test('종료 시각을 검증하고 기존 일정 확정 계약을 유지',async()=>{
  let saved;const service=new AnalysesService({saveSchedule:async(_user,_id,input)=>{saved=input;return input;}},{},{},{});
  const input={title:'회의',date:'2026-09-11',time:'16:30',endTime:'17:30'};
  await service.saveSchedule({id:'synthetic',token:'synthetic'},'synthetic',input,true);assert.deepEqual(saved,input);
  for(const endTime of ['16:00','16:30','25:00'])assert.throws(()=>service.saveSchedule({},'synthetic',{...input,endTime},true));
});
