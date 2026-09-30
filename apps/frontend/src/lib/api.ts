export type HealthResponse = { status: 'ok'; service: 'backend' };

export async function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', { signal });
  if (!response.ok) throw new Error('서버 상태를 확인하지 못했습니다.');
  const data: unknown = await response.json();
  if (typeof data !== 'object' || data === null || !('status' in data) ||
      data.status !== 'ok' || !('service' in data) || data.service !== 'backend') {
    throw new Error('서버 응답 형식이 올바르지 않습니다.');
  }
  return { status: data.status, service: data.service };
}
