export const PERSONA_LIMIT = 200;

export interface PersonaBudget { detail: number; jev: number; total: number }

// .env를 읽은 뒤 서비스가 생성될 때 평가한다. 모듈 import 시점에는 환경을 읽지 않는다.
export function personaBudget(env: NodeJS.ProcessEnv = process.env): PersonaBudget {
  const count = (key: string) => {
    const raw = env[key] ?? '50';
    if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > PERSONA_LIMIT) {
      throw new Error(`${key}는 0~${PERSONA_LIMIT} 사이의 정수여야 합니다.`);
    }
    return Number(raw);
  };
  const detail = count('PERSONA_DETAIL_COUNT'), jev = count('PERSONA_JEV_COUNT');
  const total = detail + jev;
  if (total < 1 || total > PERSONA_LIMIT) throw new Error(`페르소나 인원 합계는 1~${PERSONA_LIMIT}명이어야 합니다.`);
  return { detail, jev, total };
}

// 희소 표본은 기존 정책대로 상세 응답을 먼저 배정한다.
export function allocatePersonas(available: number, budget: PersonaBudget) {
  const selected = Math.min(budget.total, available);
  const detail = Math.min(budget.detail, selected);
  return { selected, detail, jev: selected - detail };
}
