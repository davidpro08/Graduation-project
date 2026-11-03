import { notFound } from 'next/navigation';
import { App } from '@/App';
export default async function Page({ params }: { params: Promise<{ tab: string; analysisId: string }> }) {
  const { tab, analysisId } = await params;
  if (tab !== 'opinions' || (analysisId !== 'history' && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(analysisId))) notFound();
  return <App/>;
}
