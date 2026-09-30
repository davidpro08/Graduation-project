import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getHealth } from '@/lib/api';

type Connection = 'loading' | 'connected' | 'failed';

export function App() {
  const [connection, setConnection] = useState<Connection>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setConnection('loading');
    getHealth(controller.signal)
      .then(() => { if (!controller.signal.aborted) setConnection('connected'); })
      .catch(() => { if (!controller.signal.aborted) setConnection('failed'); });
    return () => controller.abort();
  }, [attempt]);

  const label = { loading: '백엔드 연결 확인 중', connected: '백엔드 연결 정상', failed: '백엔드 연결 실패' }[connection];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-8 px-6 py-16">
      <header className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">그랬잖아 · 졸업프로젝트</p>
        <h1 className="text-4xl font-bold tracking-tight">기억이 다를 때, 대화에서 확인하세요.</h1>
        <p className="leading-7 text-muted-foreground">채팅 기록을 바탕으로 발언의 근거를 확인하고 갈등 해결을 돕는 서비스를 준비하고 있습니다.</p>
      </header>
      <section aria-labelledby="connection-title" className="space-y-4 rounded-xl border bg-card p-6">
        <h2 id="connection-title" className="text-lg font-semibold">개발 환경 연결 상태</h2>
        <p role="status" aria-live="polite">{label}</p>
        <div className="flex flex-wrap gap-3">
          <Button disabled={connection === 'loading'} onClick={() => setAttempt(value => value + 1)}>다시 확인</Button>
          <Button asChild variant="outline"><a href="/api/docs" target="_blank" rel="noreferrer">API 문서 열기</a></Button>
        </div>
      </section>
      <p className="text-sm text-muted-foreground">대화 업로드·분석·일정 관리는 다음 단계에서 추가합니다.</p>
    </main>
  );
}
