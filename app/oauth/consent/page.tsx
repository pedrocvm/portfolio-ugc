import { redirect } from 'next/navigation';
import { currentUser } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

function safeConsentReturn(authorizationId: string) {
  return `/oauth/consent?authorization_id=${encodeURIComponent(authorizationId)}`;
}

const SCOPE_LABEL: Record<string, string> = {
  openid: 'Identificar a conta conectada',
  email: 'Ler o e-mail da conta',
  profile: 'Ler o perfil básico da conta',
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id: authorizationId } = await searchParams;

  if (!authorizationId) {
    return (
      <main className="oauthCard">
        <p className="oauthEyebrow">CAROL OS / CONEXÃO</p>
        <h1>Pedido inválido</h1>
        <p className="oauthIntro oauthError">A autorização chegou sem identificador.</p>
      </main>
    );
  }

  const user = await currentUser();
  if (!user) {
    const next = safeConsentReturn(authorizationId);
    redirect(`/dashboard/login?next=${encodeURIComponent(next)}`);
  }

  const supabase = await supabaseServer();
  const { data: details, error } =
    await supabase.auth.oauth.getAuthorizationDetails(authorizationId);

  if (error || !details) {
    return (
      <main className="oauthCard">
        <p className="oauthEyebrow">CAROL OS / CONEXÃO</p>
        <h1>Não foi possível abrir o pedido</h1>
        <p className="oauthIntro oauthError">
          {error?.message ?? 'A solicitação de autorização já não é válida.'}
        </p>
      </main>
    );
  }

  if (!('authorization_id' in details)) {
    redirect(details.redirect_url);
  }

  const scopes = details.scope?.trim().split(/\s+/).filter(Boolean) ?? [];

  return (
    <main className="oauthCard">
      <p className="oauthEyebrow">CAROL OS / CONEXÃO</p>
      <h1>Autorizar acesso ao CarolOS</h1>
      <p className="oauthIntro">
        <strong>{details.client.name}</strong> quer ligar-se ao gerenciador de conteúdo.
        A conexão poderá ler e alterar cards e pilares em nome da Carol. A página pública
        e a personalização do site ficam fora desta integração.
      </p>

      <dl className="oauthRequest">
        <dt>Aplicação</dt>
        <dd>{details.client.name}</dd>

        <dt>Conta</dt>
        <dd>{user.app.email}</dd>

        {scopes.length ? (
          <>
            <dt>Permissões de autenticação</dt>
            <dd>
              <ul className="oauthScopes">
                {scopes.map((scope) => (
                  <li key={scope}>{SCOPE_LABEL[scope] ?? scope}</li>
                ))}
              </ul>
            </dd>
          </>
        ) : null}
      </dl>

      <form className="oauthActions" action="/api/oauth/decision" method="POST">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <button className="oauthApprove" type="submit" name="decision" value="approve">
          Autorizar ChatGPT
        </button>
        <button className="oauthDeny" type="submit" name="decision" value="deny">
          Recusar
        </button>
      </form>

      <p className="oauthFoot">
        A autorização usa a própria conta da Carol e continua sujeita às permissões do CarolOS.
      </p>
    </main>
  );
}
