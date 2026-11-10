import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Check, SlidersHorizontal, Users } from 'lucide-react';
import { useQueryResult } from '@/features/conversations/hooks';
import { basicDimensions, advancedDimensions, dimensions, dimensionLabels, optionLabel, type Dimension, type Facets, type Filters } from './types';
import { RegionMap } from './region-map';
import { fetchPersonaFacets } from './personas-api';

type FilterProps = { options: Facets; value: Filters; onChange: (filters: Filters) => void; disabled?: boolean; conversationId?: string };
export function PersonaFilters({ options, value, onChange, disabled = false, conversationId }: FilterProps) {
  const [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const [localSearch, setLocalSearch] = useState<Partial<Record<Dimension, string>>>({});
  const province = value.province ?? [];
  const remote = useQueryResult(JSON.stringify(['persona-facets', conversationId, province, search, page]), signal => fetchPersonaFacets(conversationId!, province, search, page, signal), !!conversationId);
  const ready = !conversationId || (!remote.loading && !remote.error && !!remote.data);
  const localOccupations = options.occupation.filter(item => item.includes(search));
  const occupations = conversationId ? remote.data?.values.occupation ?? [] : localOccupations.slice((page - 1) * 50, page * 50);
  const total = conversationId ? remote.data?.occupation.total ?? 0 : localOccupations.length;
  const change = (key: Dimension, selected: string[]) => onChange({ ...value, [key]: selected, ...(key === 'province' ? { district: [] } : {}) });
  const notes: Partial<Record<Dimension, string>> = {
    familyType: '혼자 거주와 배우자 별거는 원본의 서로 다른 항목입니다.', occupation: '원본 직업명을 검색합니다. 무직에는 학생·은퇴자 등이 구분되어 있지 않습니다.',
    district: '시도를 먼저 선택하세요. 시도를 바꾸면 시군구 선택이 초기화됩니다.', bachelorsField: '4년제 대학교·대학원 학력에만 기록된 학사 전공입니다.',
    housingType: '주택의 형태입니다. 자가·전세·월세나 소득을 의미하지 않습니다.', militaryStatus: '현재 현역인지 나타냅니다. 군필·미필 여부가 아닙니다.',
  };
  const group = (key: Dimension) => {
    const blocked = key === 'district' && !province.length;
    const values = key === 'occupation' ? occupations : key === 'district' ? conversationId ? remote.data?.values.district ?? [] : options.district.filter(item => province.some(p => item.startsWith(`${p}-`))) : options[key];
    const choices = [...new Set([...(value[key] ?? []), ...values])].filter(option => key === 'occupation' || !localSearch[key] || option.includes(localSearch[key]!) || value[key]?.includes(option));
    const dynamic = key === 'occupation' || key === 'district';
    return <section key={key} className="persona-filter-group" aria-label={`${dimensionLabels[key]} 조건`}>
      <div className="filter-group-heading"><h3>{dimensionLabels[key]}</h3><span>{value[key]?.length ? `${value[key]!.length}개 선택` : '전체'}</span></div>
      {notes[key] && <p className="small muted filter-help">{notes[key]}</p>}
      {(key === 'occupation' || key === 'familyType' || key === 'district') && <Input aria-label={`${dimensionLabels[key]} 선택지 검색`} placeholder={`${dimensionLabels[key]} 검색`} maxLength={100} disabled={blocked} value={key === 'occupation' ? search : localSearch[key] ?? ''} onChange={event => { if (key === 'occupation') { setSearch(event.target.value); setPage(1); } else setLocalSearch({ ...localSearch, [key]: event.target.value }); }}/>}
      <div className="filter-chip-list filter-choices"><button type="button" className="filter-chip filter-all" aria-pressed={!value[key]?.length} disabled={blocked} onClick={() => change(key, [])}><Check size={13}/>전체 선택</button>
        {!blocked && (!dynamic || ready) && choices.map(option => <button key={option} type="button" className="filter-chip"
          disabled={(value[key]?.length ?? 0) >= 30 && !value[key]?.includes(option)} aria-pressed={value[key]?.includes(option) ?? false}
          onClick={() => change(key, value[key]?.includes(option) ? value[key]!.filter(item => item !== option) : [...(value[key] ?? []), option])}>{optionLabel(key, option)}</button>)}
      </div>
      {dynamic && !blocked && conversationId && remote.loading && <p className="small muted" role="status">선택지 조회 중…</p>}
      {dynamic && !blocked && remote.error && <p role="alert" className="small">{remote.error} <button type="button" onClick={remote.retry}>다시 조회</button></p>}
      {!blocked && ready && !choices.length && <p className="small muted">일치하는 항목이 없습니다.</p>}
      {key === 'occupation' && <div className="filter-pagination"><Button type="button" size="sm" variant="ghost" disabled={page <= 1 || !ready} onClick={() => setPage(page - 1)}>이전</Button><span className="small muted">{page} / {Math.max(1, Math.ceil(total / 50))} · {total.toLocaleString()}개 직업</span><Button type="button" size="sm" variant="ghost" disabled={page * 50 >= total || !ready} onClick={() => setPage(page + 1)}>다음</Button></div>}
      {key === 'province' && <details className="filter-map"><summary>지도에서 선택</summary><RegionMap options={options.province} selected={province} disabled={disabled} onChange={selected => change('province', selected)}/></details>}
    </section>;
  };
  return <fieldset disabled={disabled} className="persona-filters"><legend className="sr-only">페르소나 조건</legend>
    <p className="small muted">전체 선택은 조건 제한이 없는 상태입니다. 다른 항목을 누르면 해제됩니다. 항목당 최대 30개를 선택할 수 있습니다.</p>
    <div className="persona-filter-grid">{basicDimensions.map(group)}</div>
    <details className="advanced-filters"><summary>고급 조건 <span className="small muted">직업 · 시군구 · 학사 전공 · 주택 · 현역 여부</span></summary><div className="persona-filter-grid">{advancedDimensions.map(group)}</div></details>
    <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange({})}>모든 조건 초기화</Button>
  </fieldset>;
}

export function PersonaFilterPanel({ title = '분석 대상', ...props }: FilterProps & { title?: string }) {
  const count = dimensions.filter(key => props.value[key]?.length).length;
  return <section className="persona-inline-panel"><div className="inline-filter-heading"><h2><SlidersHorizontal size={18}/>{title}</h2><span className="filter-trigger-count">{count ? `${count}개 조건` : '전체'}</span></div><PersonaFilters {...props}/><p className="small muted">항목 안에서 하나 이상 일치 · 항목 간 모두 일치</p></section>;
}

export function SpeakerFilter({ participants, value, onChange, disabled }: { participants: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean }) {
  const [search, setSearch] = useState('');
  return <section className="speaker-filter-inline"><div className="inline-filter-heading"><h2><Users size={18}/>발언자</h2><span className="filter-trigger-count">{value.length ? `${value.length}명` : '전체'}</span></div><p className="small muted">쟁점 문서에 참고할 참여자를 선택하세요.</p><fieldset disabled={disabled} className="speaker-filter-fields"><legend className="sr-only">발언자 선택</legend><Input aria-label="발언자 검색" placeholder="이름 검색" value={search} onChange={event => setSearch(event.target.value)}/><div className="filter-chip-list"><button type="button" className="filter-chip filter-all" aria-pressed={!value.length} onClick={() => onChange([])}>전체 선택</button>{participants.filter(person => person.name.includes(search)).map(person => <button type="button" key={person.id} className="filter-chip" aria-pressed={value.includes(person.id)} onClick={() => onChange(value.includes(person.id) ? value.filter(id => id !== person.id) : [...value, person.id])}>{person.name}</button>)}</div></fieldset></section>;
}
