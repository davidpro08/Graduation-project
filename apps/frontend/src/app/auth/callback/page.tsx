import { CallbackPage } from '@/features/auth/callback-page';

export const metadata = { title: '로그인 완료 · 그랬잖아', robots: { index: false, follow: false }, referrer: 'no-referrer' as const };
export default function Page() { return <CallbackPage />; }
