import { NextResponse, type NextRequest } from 'next/server';
import { supabaseService } from '@/lib/supabase/service';
import { recordEvent } from '@/modules/activity/service';
import { completeOAuth, readState } from '@/modules/integrations/instagram/oauth';

export const dynamic = 'force-dynamic';

const settings = (base: string, params: Record<string, string>) =>
  NextResponse.redirect(`${base}/dashboard/settings?${new URLSearchParams(params)}`);

/** O retorno do consentimento.
 *
 *  O token nunca aparece na URL de redirecionamento nem em log nenhum: o que
 *  volta ao browser é «ligado» ou um código de erro. */
export async function GET(request: NextRequest) {
  const base = process.env.APP_BASE_URL ?? request.nextUrl.origin;
  const url = request.nextUrl;

  const error = url.searchParams.get('error');
  if (error) return settings(base, { instagram: 'error', code: error.slice(0, 40) });

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return settings(base, { instagram: 'error', code: 'missing_params' });

  const verified = await readState(state);
  if (!verified) return settings(base, { instagram: 'error', code: 'bad_state' });

  const r = await completeOAuth(code, verified.appUserId);
  if (!r.ok) return settings(base, { instagram: 'error', code: 'exchange_failed' });

  await recordEvent(supabaseService(), {
    eventType: 'integration.connected',
    actorType: 'carol',
    actorUserId: verified.appUserId,
    summary: `Instagram ligado: @${r.username}.`,
    payload: { provider: 'instagram', account: r.username },
  }).catch(() => null);

  // A ligação nova fecha o cartão de reconectar, se existia.
  await supabaseService()
    .from('action_item')
    .update({ status: 'done' })
    .eq('dedupe_key', 'integration:instagram:reconnect');

  return settings(base, { instagram: 'ok', account: r.username });
}
