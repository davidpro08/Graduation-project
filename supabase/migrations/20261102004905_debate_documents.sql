alter table public.persona_debates
  add column document jsonb check (document is null or jsonb_typeof(document) = 'object'),
  add column revision integer not null default 0 check (revision >= 0),
  add column speaker_ids jsonb not null default '[]' check (jsonb_typeof(speaker_ids) = 'array' and jsonb_array_length(speaker_ids) <= 400);
-- 기존 상태·결과와 RLS/FK는 유지하고 문서 검토 상태만 추가한다.
alter table public.persona_debates drop constraint persona_debates_status_check;
alter table public.persona_debates add constraint persona_debates_status_check check (status in ('pending','processing','review','completed','failed'));
alter table public.persona_debates drop constraint persona_debates_stage_check;
alter table public.persona_debates add constraint persona_debates_stage_check check (stage in ('pending','sampling','refining','review','detail','jev','completed','failed'));
alter table public.persona_debates add constraint persona_debates_review_document_check check (status <> 'review' or (document is not null and revision > 0));
comment on column public.persona_debates.document is '사용자가 확인·수정하는 논쟁 문서. 실제 발언 근거와 예상 논리를 구분한다.';
comment on column public.persona_debates.revision is '문서 동시 수정 및 분석 중복 시작 방지를 위한 낙관적 버전 번호';
