import { colors, type Profile } from './types';

const families = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'];
const names = ['서윤', '지후', '하린', '도윤', '수현', '지안', '서진', '유진', '시온', '지우', '하준', '민서', '준서', '예린', '수빈', '다온', '시우', '하은', '은우', '채원', '이든', '서우', '민재', '지율', '연우', '다인', '재윤', '아린', '태린', '소율', '해솔', '하람'];
export function displayName(persona: Profile) {
  if (persona.name?.trim()) return persona.name.trim();
  let hash = 2166136261;
  for (const char of persona.id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  const value = hash >>> 0;
  return families[value % families.length] + names[Math.floor(value / families.length) % names.length];
}
export function stancePresentation(agreement?: number) {
  if (agreement === undefined) return { label: '응답 없음', color: colors[2] };
  const index = agreement <= -0.6 ? 0 : agreement < -0.2 ? 1 : agreement <= 0.2 ? 2 : agreement < 0.6 ? 3 : 4;
  return { label: ['강한 반대', '반대', '중립', '찬성', '강한 찬성'][index], color: colors[index] };
}
