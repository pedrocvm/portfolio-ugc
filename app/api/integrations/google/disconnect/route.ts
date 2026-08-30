import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { disconnect } from '@/modules/integrations/gmail/oauth';

export const dynamic = 'force-dynamic';

export async function POST() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sem sessão.' }, { status: 401 });

  await disconnect(user.app.id);
  return NextResponse.json({ ok: true });
}
