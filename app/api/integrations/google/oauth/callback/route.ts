import { NextResponse, type NextRequest } from 'next/server';
import { getProfile } from '@/modules/integrations/gmail/client';
import { exchangeCode, googleConfig, readState, saveConnection, GMAIL_SCOPES } from '@/modules/integrations/gmail/oauth';
import { recordEvent } from '@/modules/activity/service';
import { supabaseService } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

const settings = (base: string, params: Record<string, string>) =>
  NextResponse.redirect(`${base}/dashboard/settings?${new URLSearchParams(params)}`);

export async function GET(request: NextRequest) {
  const base = process.env.APP_BASE_URL ?? request.nextUrl.origin;
  const url = request.nextUrl;

  const error = url.searchParams.get('error');
  if (error) return settings(base, { google: 'error', code: error });

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return settings(base, { google: 'error', code: 'missing_params' });

  const cfg = googleConfig();
  if (!cfg) return settings(base, { google: 'error', code: 'not_configured' });

  // O `state` prova que este callback pertence à sessão que iniciou o pedido.
  const verified = await readState(state);
  if (!verified) return settings(base, { google: 'error', code: 'bad_state' });

  try {
    const token = await exchangeCode(cfg, code);
    const profile = await getProfile(token.access_token);

    await saveConnection({
      appUserId: verified.appUserId,
      account: profile.emailAddress,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
      scopes: token.scope?.split(' ') ?? GMAIL_SCOPES,
    });

    await recordEvent(supabaseService(), {
      eventType: 'integration.connected',
      actorType: 'carol',
      actorUserId: verified.appUserId,
      summary: `Gmail ligado: ${profile.emailAddress}.`,
      payload: { provider: 'google_gmail', account: profile.emailAddress },
    });

    return settings(base, { google: 'connected' });
  } catch (caught) {
    // A mensagem pode conter o código de autorização; só a etiqueta sai.
    const label = caught instanceof Error ? caught.message.split(':')[0] : 'exchange_failed';
    return settings(base, { google: 'error', code: label });
  }
}
