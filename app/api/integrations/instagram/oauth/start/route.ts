import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { instagramConfig, missingConfig } from '@/modules/integrations/instagram/config';
import { authorizeUrl, buildState } from '@/modules/integrations/instagram/oauth';

export const dynamic = 'force-dynamic';

/** Arranque do consentimento. Só quem já tem sessão começa, e o `state` fica
 *  assinado e amarrado ao id dessa sessão — sem isso, alguém podia mandar a
 *  Carol a um callback preparado e ligar outra conta ao CarolOS. */
export async function GET() {
  const base = process.env.APP_BASE_URL ?? 'http://localhost:3000';
  const user = await currentUser();
  if (!user) return NextResponse.redirect(new URL('/dashboard/login', base));

  const cfg = instagramConfig();
  if (!cfg) {
    return NextResponse.json(
      { error: `Falta configurar ${missingConfig().join(' e ')} no ambiente.` },
      { status: 503 },
    );
  }

  return NextResponse.redirect(authorizeUrl(cfg, await buildState(user.app.id)));
}
