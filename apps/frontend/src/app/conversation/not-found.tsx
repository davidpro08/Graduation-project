'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, Empty } from '@/components/layout';

export default function ConversationNotFound() {
  return <main className="login-page"><Card>
    <Empty title="대화를 찾을 수 없습니다">삭제되었거나 접근할 수 없는 대화입니다.</Empty>
    <Button asChild><Link href="/conversations">내 대화로 돌아가기</Link></Button>
  </Card></main>;
}
