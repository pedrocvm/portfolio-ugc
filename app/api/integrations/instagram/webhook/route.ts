import { NextResponse, type NextRequest } from 'next/server';
import { envelopeFor, storeEvent, verifySignature, verifySubscription } from '@/modules/integrations/instagram/webhooks';

export const dynamic = 'force-dynamic';

/** Verificação da subscrição. A Meta chama isto uma vez ao registar o URL. */
export async function GET(request: NextRequest) {
  const r = verifySubscription(request.nextUrl.searchParams, process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN ?? null);
  if (!r.ok) return new NextResponse(r.reason, { status: r.status });
  return new NextResponse(r.challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
}

/** Ingestão.
 *
 *  Responde depressa: guarda o envelope e devolve 200. O trabalho pesado é de
 *  um job — a Meta desativa um webhook que demore a responder.
 *
 *  Um evento sem assinatura válida não entra. O corpo cru é lido como texto
 *  porque reserializar o JSON muda os espaços e a assinatura deixa de bater. */
export async function POST(request: NextRequest) {
  const raw = await request.text();
  const assinado = await verifySignature(
    raw,
    request.headers.get('x-hub-signature-256'),
    process.env.INSTAGRAM_CLIENT_SECRET ?? null,
  );
  if (!assinado) return new NextResponse('assinatura inválida', { status: 401 });

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new NextResponse('corpo inválido', { status: 400 });
  }

  const envelope = await envelopeFor(raw, payload);
  await storeEvent(envelope);
  return NextResponse.json({ ok: true });
}
