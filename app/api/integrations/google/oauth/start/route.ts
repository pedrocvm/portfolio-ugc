import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { authorizeUrl, buildState, googleConfig } from '@/modules/integrations/gmail/oauth';

export const dynamic = 'force-dynamic';

/** Arranque do consentimento. Só quem já tem sessão pode começar, e o `state`
 *  fica assinado e amarrado ao id dessa sessão. */
export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/dashboard/login', process.env.APP_BASE_URL ?? 'http://localhost:3000'));

  const cfg = googleConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: 'Faltam GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente.' },
      { status: 503 },
    );
  }

  return NextResponse.redirect(authorizeUrl(cfg, await buildState(user.app.id)));
}
