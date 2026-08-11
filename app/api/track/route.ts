import { createClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/supabase/config';

const TYPES = new Set(['view', 'click', 'contact', 'share']);

const cut = (v: unknown, n: number) =>
  typeof v === 'string' ? v.slice(0, n) : '';

/** Só o domínio de origem. O caminho completo diria que página a pessoa
 *  estava a ler, e isso não é preciso para saber de onde vêm as visitas. */
function origem(referrer: unknown) {
  const raw = cut(referrer, 500);
  if (!raw) return '';
  try {
    return new URL(raw).hostname.replace(/^www\./, '').slice(0, 120);
  } catch {
    return '';
  }
}

function aparelho(ua: string) {
  if (/iPad|Tablet|PlayBook|Silk|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone/i.test(ua)) return 'mobile';
  return ua ? 'desktop' : '';
}

export async function POST(req: Request) {
  /* nada do que aqui se passa muda o que a pessoa vê: qualquer falha responde
     204 na mesma, e o pedido nunca atrasa a navegação */
  const vazio = new Response(null, { status: 204 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') return vazio;

  const { type } = body as Record<string, unknown>;
  if (typeof type !== 'string' || !TYPES.has(type)) return vazio;

  const params = new URLSearchParams(cut((body as { search?: unknown }).search, 500));

  await createClient(SUPABASE_URL, SUPABASE_KEY)
    .from('link_event')
    .insert({
      type,
      target: cut((body as { target?: unknown }).target, 120),
      referrer: origem((body as { referrer?: unknown }).referrer),
      utm_source: cut(params.get('utm_source'), 60),
      utm_medium: cut(params.get('utm_medium'), 60),
      utm_campaign: cut(params.get('utm_campaign'), 60),
      device: aparelho(req.headers.get('user-agent') ?? ''),
      country: cut(req.headers.get('x-vercel-ip-country'), 2),
      session: cut((body as { session?: unknown }).session, 40),
    });

  return vazio;
}
