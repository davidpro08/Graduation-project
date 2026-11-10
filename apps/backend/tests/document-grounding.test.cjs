require('reflect-metadata');const {test}=require('node:test'),assert=require('node:assert/strict');const {groundedFacts,factLines}=require('../dist/debates/document-grounding');
const message={id:'m1',text:'총 6만원을 냈어.'};const fact={text:'참여자가 6만원 지불했다고 말함',kind:'reported',messageId:'m1',quote:'6만원을 냈어.'};
test('대화 정보는 검증 사실과 구분하며 실제 인용만 연결',()=>{const fs=groundedFacts([fact],[message],null);assert.match(factLines(fs)[0],/외부 검증 전/);for(const f of [{...fact,messageId:'forged'},{...fact,quote:'10만원을 냈어.'}])assert.throws(()=>groundedFacts([f],[message],null),e=>e.code==='AI_TOPIC_EVIDENCE');});
test('이전 구간의 확인한 근거는 그대로 유지하고 변형된 이전 사실은 거절',()=>{const previous={factEvidence:[fact]};assert.equal(groundedFacts([fact],[],previous).length,1);assert.throws(()=>groundedFacts([{...fact,text:'다른 주장'}],[],previous));});
test('가정과 미확인 정보에 근거 인용을 붙이지 않음',()=>{const fs=groundedFacts([{...fact,kind:'unknown'}],[message],null);assert.equal(fs[0].messageId,null);assert.equal(fs[0].quote,null);});
