import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { disconnect } from '@/modules/integrations/instagram/oauth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  await disconnect();
  return NextResponse.json({ ok: true });
}
