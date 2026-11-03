import { AnalysisError } from './analysis.types';

/** 업로드한 대화의 마지막 날짜를 기준으로 달력상 한 달 전부터 양 끝 날짜를 포함한다. */
export function recentAnalysisWindow(endDate: string): { from: string; to: string } {
  if (typeof endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new AnalysisError('ANALYSIS_FAILED');
  const end = new Date(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(end.getTime()) || end.toISOString().slice(0, 10) !== endDate) throw new AnalysisError('ANALYSIS_FAILED');
  const start = new Date(end);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 1);
  const lastDay = new Date(start);
  lastDay.setUTCMonth(lastDay.getUTCMonth() + 1, 0);
  start.setUTCDate(Math.min(end.getUTCDate(), lastDay.getUTCDate()));
  return { from: start.toISOString().slice(0, 10), to: endDate };
}
