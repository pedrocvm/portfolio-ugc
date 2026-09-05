import { NextResponse, type NextRequest } from 'next/server';
import { supabaseService } from '@/lib/supabase/service';
import { verifySignature } from '@/modules/integrations/instagram/webhook-verify';

export const dynamic = 'force-dynamic';

/** Pedido de apagamento de dados, exigido para publicar a app.
 *
 *  Apaga o que veio da Meta — mídia, snapshots, comentários — e mantém o que é
 *  dela: histórias, estrutura, aprendizados. Apagar as histórias por causa de
 *  um pedido de apagamento da Meta seria apagar a memória dela por causa de
 *  uma integração. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const assinado = await verifySignature(
    raw,
    request.headers.get('x-hub-signature-256'),
    process.env.INSTAGRAM_CLIENT_SECRET ?? null,
  );
  if (!assinado) return new NextResponse('assinatura inválida', { status: 401 });

  const db = supabaseService();
  const confirmationCode = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  // Cascata: apagar a conta leva mídia, snapshots e comentários com ela.
  await db.from('instagram_account').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await db
    .from('integration_connection')
    .update({ status: 'revoked', encrypted_access_token: null, token_expires_at: null })
    .eq('provider', 'instagram');

  const base = process.env.APP_BASE_URL ?? request.nextUrl.origin;
  return NextResponse.json({
    url: `${base}/dashboard/settings?deletion=${confirmationCode}`,
    confirmation_code: confirmationCode,
  });
}
