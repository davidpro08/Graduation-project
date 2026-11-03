// 행정 경계 대신 한반도 윤곽과 시도 위치를 사용한 선택용 개략도다.
const regions: [string, string[], number, number][] = [
  ['서울', ['서울특별시', '서울'], 98, 105], ['인천', ['인천광역시', '인천'], 42, 132], ['경기', ['경기도', '경기'], 123, 145],
  ['강원', ['강원특별자치도', '강원도', '강원'], 195, 107], ['충북', ['충청북도', '충청북', '충북'], 167, 202],
  ['충남', ['충청남도', '충청남', '충남'], 57, 212], ['세종', ['세종특별자치시', '세종'], 112, 197], ['대전', ['대전광역시', '대전'], 116, 248],
  ['경북', ['경상북도', '경상북', '경북'], 228, 224], ['대구', ['대구광역시', '대구'], 211, 279],
  ['전북', ['전북특별자치도', '전라북도', '전북'], 84, 291], ['전남', ['전라남도', '전라남', '전남'], 69, 379],
  ['광주', ['광주광역시', '광주'], 51, 338], ['경남', ['경상남도', '경상남', '경남'], 170, 337],
  ['울산', ['울산광역시', '울산'], 271, 293], ['부산', ['부산광역시', '부산'], 242, 350], ['제주', ['제주특별자치도', '제주도', '제주'], 60, 455],
];
export function RegionMap({ options, selected, onChange, disabled = false }: { options: string[]; selected: string[]; onChange: (values: string[]) => void; disabled?: boolean }) {
  return <figure className="region-map"><svg viewBox="0 0 320 490" role="group" aria-label="대한민국 17개 시도 선택 개략도">
    <path d="M102 57 136 41 171 53 198 25 212 61 231 93 253 126 262 164 277 202 276 249 288 280 278 307 265 337 240 367 205 371 182 360 160 382 140 373 117 397 90 388 67 409 44 393 33 369 47 350 30 325 43 301 34 280 47 258 33 236 42 207 29 181 55 162 50 138 70 121 83 92Z" fill="var(--surface-alt, #edf2f1)" stroke="#bacac6" strokeWidth="2"/>
    <ellipse cx="60" cy="453" rx="34" ry="14" fill="var(--surface-alt, #edf2f1)" stroke="#bacac6"/>
    {regions.map(([name, aliases, x, y]) => {
      const value = options.find(option => aliases.includes(option));
      const active = !!value && selected.includes(value);
      const toggle = () => { if (value && !disabled) onChange(active ? selected.filter(item => item !== value) : [...selected, value]); };
      return <g key={name} role="button" aria-label={`${name}${value ? '' : ' · 표본 없음'}`} aria-pressed={active} aria-disabled={!value || disabled} tabIndex={value && !disabled ? 0 : -1}
        onClick={toggle} onKeyDown={event => { if (['Enter', ' '].includes(event.key)) { event.preventDefault(); toggle(); } }} className="region-marker">
        <rect x={x - 21} y={y - 14} width="42" height="28" rx="10" fill={active ? '#19665f' : '#fff'} stroke={active ? '#19665f' : '#a7b6b3'} opacity={value ? 1 : 0.4}/>
        <text x={x} y={y + 4} textAnchor="middle" fontSize="12" fill={active ? '#fff' : '#364841'}>{name}</text>
      </g>;
    })}
  </svg><figcaption className="small muted">시도 위치 개략도 · 지역을 누르면 선택/해제됩니다.</figcaption></figure>;
}
