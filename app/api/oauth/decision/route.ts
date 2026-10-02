import { NextResponse } from 'next/server';
import { currentUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: 'Autenticação necessária.' }, { status: 401 });
  }

  const form = await request.formData();
  const authorizationId = String(form.get('authorization_id') ?? '').trim();
  const decision = String(form.get('decision') ?? '').trim();

  if (!authorizationId || !['approve', 'deny'].includes(decision)) {
    return NextResponse.json({ error: 'Pedido de autorização inválido.' }, { status: 400 });
  }

  const supabase = await supabaseServer();

  const result =
    decision === 'approve'
      ? await supabase.auth.oauth.approveAuthorization(authorizationId)
      : await supabase.auth.oauth.denyAuthorization(authorizationId);

  if (result.error || !result.data?.redirect_url) {
    return NextResponse.json(
      { error: result.error?.message ?? 'Não foi possível concluir a autorização.' },
      { status: 400 },
    );
  }

  return NextResponse.redirect(result.data.redirect_url, 303);
}
