import { NextResponse, type NextRequest } from 'next/server';
import { currentUser } from '@/lib/auth';
import { disconnect } from '@/modules/integrations/gmail/oauth';

export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'Sem sessão.' }, { status: 401 });

  // Qual caixa. A consulta é filtrada pelo usuário da sessão, por isso um id
  // de outra pessoa não encontra linha nenhuma em vez de desligar a errada.
  const body = await request.json().catch(() => ({}));
  const connectionId = typeof body?.connectionId === 'string' ? body.connectionId : '';
  if (!UUID.test(connectionId)) {
    return NextResponse.json({ error: 'Falta indicar a caixa.' }, { status: 400 });
  }

  await disconnect(user.app.id, connectionId);
  return NextResponse.json({ ok: true });
}
