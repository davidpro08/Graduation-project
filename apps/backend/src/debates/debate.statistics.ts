import { dimensions, dimensionValue, type Dimension, type PersonaResponse, type AnswerSchema, type PersonaFilters } from './debate.types';

export const stanceLabels = ['강한 반대', '반대', '중립', '찬성', '강한 찬성'];
export const stanceCoordinates = [-1, -0.5, 0, 0.5, 1];
export function stance(agreement: number) {
  return agreement <= -0.6 ? 0 : agreement < -0.2 ? 1 : agreement <= 0.2 ? 2 : agreement < 0.6 ? 3 : 4;
}
export function aggregate(responses: PersonaResponse[], filters: PersonaFilters = {}, schema?:AnswerSchema) {
  const selected = responses.filter(row => dimensions.every(key => !filters[key]?.length || filters[key]!.includes(dimensionValue(row.persona, key))));
  const valid = selected.filter(row => row.status === 'completed' && row.opinion);
  const lite = valid.filter(row => row.mode === 'jev');
  const scoreKinds = [...new Set(lite.map(row => row.opinion!.scoreKind ?? 'self_reported'))];
  const confidenceSum = lite.reduce((sum, row) => sum + row.opinion!.confidence, 0);
  const labels=schema?schema.options.map(o=>o.label):stanceLabels;
  const indexFor=(row:PersonaResponse)=>schema?schema.options.findIndex(o=>o.id===row.opinion?.optionId):stance(row.opinion!.agreement);
  const numeric=valid.filter(r=>r.mode==='detail'&&typeof r.opinion?.numericValue==='number').map(r=>r.opinion!.numericValue!).sort((a,b)=>a-b);
  const distribution = labels.map((label, index) => ({ label, count: valid.filter(row => indexFor(row) === index).length }));
  const demographics = Object.fromEntries(dimensions.map(key => [key,
    [...new Set(selected.map(row => dimensionValue(row.persona, key)))].sort().map(value => {
      const group = selected.filter(row => dimensionValue(row.persona, key) === value);
      const answered = group.filter(row => row.status === 'completed' && row.opinion);
      return { value, selected: group.length, answered: answered.length,
        counts: labels.map((_, index) => answered.filter(row => indexFor(row) === index).length) };
    })])) as Record<Dimension, { value: string; selected: number; answered: number; counts: number[] }[]>;
  return {
    numericSummary:numeric.length?{count:numeric.length,mean:numeric.reduce((a,b)=>a+b,0)/numeric.length,median:(numeric[Math.floor((numeric.length-1)/2)]+numeric[Math.floor(numeric.length/2)])/2,min:numeric[0],max:numeric[numeric.length-1]}:null,
    selected: selected.length, answered: valid.length, failed: selected.length - valid.length,
    detailAnswered: valid.filter(row => row.mode === 'detail').length, jevAnswered: lite.length,
    distribution, demographics,
    jevAgreement: confidenceSum ? lite.reduce((sum, row) => sum + row.opinion!.agreement * row.opinion!.confidence, 0) / confidenceSum : null,
    jevConfidence: lite.length ? confidenceSum / lite.length : null,
    jevScoreKind: !scoreKinds.length ? null : scoreKinds.length === 1 ? scoreKinds[0] : 'mixed',
    // 입장 좌표의 거리로 계산한다. 답변 문장 자체의 의미적 동의 여부나 정확도는 아니다.
    spectrum: valid.filter(row => row.mode === 'detail').map(row => ({ personaId: row.persona.id,
      agreement: row.opinion!.agreement, confidence: row.opinion!.confidence,
      alignment: confidenceSum ? lite.reduce((sum, other) => sum + (1 - Math.abs(row.opinion!.agreement - other.opinion!.agreement) / 2) * other.opinion!.confidence, 0) / confidenceSum : null,
    })),
  };
}
