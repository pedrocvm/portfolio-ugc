import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/** A área privada agora começa onde a Carol trabalha de verdade: Conteúdo. */
export default async function DashboardPage() {
  await requireUser();
  redirect('/dashboard/content');
}
