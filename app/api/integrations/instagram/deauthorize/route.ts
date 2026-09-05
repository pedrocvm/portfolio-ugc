import { NextResponse, type NextRequest } from 'next/server';
import { markRevoked } from '@/modules/integrations/instagram/oauth';
import { verifySignature } from '@/modules/integrations/instagram/webhook-verify';

export const dynamic = 'force-dynamic';

/** A Meta chama isto quando alguém retira o acesso à app.
 *
 *  Marca a ligação como revogada para o sync parar de tentar e o Hoje mostrar
 *  o cartão de reconectar. Não apaga dados: as histórias e as métricas já
 *  recolhidas são dela. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const assinado = await verifySignature(
    raw,
    request.headers.get('x-hub-signature-256'),
    process.env.INSTAGRAM_CLIENT_SECRET ?? null,
  );
  // A Meta assina isto com o formato `signed_request`; enquanto o app não
  // estiver publicado, aceitar sem assinatura seria abrir um endpoint que
  // revoga a ligação a quem descobrir o URL.
  if (!assinado) return new NextResponse('assinatura inválida', { status: 401 });

  await markRevoked('deauthorize callback');
  return NextResponse.json({ ok: true });
}
