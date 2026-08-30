# portfolio-ugc · CarolOS

Duas coisas na mesma aplicação:

- **o portfólio público** de Carol Queiroz, UGC Creator — `carolqueiroz.pt`;
- **o CarolOS**, a área privada onde a operação comercial dela acontece.

Next.js (App Router) + TypeScript + Supabase, um deploy na Vercel.

## O que o CarolOS é

Não é um CRM para preencher. A premissa que governa cada decisão é que **a
Carol não mantém o sistema**: ele observa o trabalho que ela já faz, guarda o
contexto, e diz-lhe o que fazer a seguir. Se uma funcionalidade depender de ela
se lembrar de actualizar alguma coisa, está mal desenhada.

Na prática:

- uma conversa no Gmail cria a marca, o contacto, a oportunidade e os eventos;
- o follow-up é agendado a partir da regra e da promessa da marca, não da memória;
- o preço sai de política versionada, e diz «por resolver» quando não sabe;
- direitos de uso são uma licença separada da produção, com fim obrigatório;
- nada sai para fora sem ela ler.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # e preencher
npm run dev                  # http://localhost:3000
```

O portfólio público só precisa de `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. O resto do CarolOS degrada com elegância: sem
`ANTHROPIC_API_KEY` a camada de IA fica inerte e a interface diz porquê; sem
`GOOGLE_CLIENT_ID` o botão de ligar o Gmail explica o que falta. Nada rebenta.

## Gates

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run test         # node --test: domínio, cenários, contratos de IA
npm run build        # next build
```

Dois comandos que não correm no CI:

```bash
npm run eval:ai      # avaliação da IA contra o modelo real; precisa de chave
npm run db:types     # regenera lib/supabase/database.types.ts
```

A avaliação da IA fica fora do CI de propósito: chamar um modelo por commit é
caro, lento, e a variação natural dele tornaria o CI numa moeda ao ar. Os testes
de integração saltam-se sozinhos sem `SUPABASE_TEST_*`, que têm de apontar para
um projeto **descartável** — eles escrevem e apagam.

### Dependências

Depois de instalar ou remover pacotes, regenerar o `package-lock.json`:

```bash
rm package-lock.json && npm install --package-lock-only
```

Um `npm install` normal no macOS escreve um lock incompleto — nunca resolve as
variantes de outras plataformas (`@img/sharp-wasm32` e as suas dependências),
e o `npm ci` do CI, que corre em Linux, rejeita-o.

## Estrutura

```
app/
  page.tsx, contato/        o portfólio público
  dashboard/(app)/          o CarolOS
    page.tsx                Hoje — a fila de decisões
    inbox/  opportunities/  followups/  capture/
    brands/ production/     revenue/ analytics/ cases/ content/
    site/                   o editor do portfólio (era o /dashboard antigo)
    documents/ clients/ funnel/ account/ settings/
  api/
    integrations/google/    OAuth do Gmail
    jobs/[job]/             trabalhos de fundo, atrás de CRON_SECRET
    track/                  os acessos à página de links

modules/                    o domínio, um por área
  <área>/domain.ts          regras puras: sem Next, sem Supabase, sem SDK
  <área>/service.ts         acesso a dados; marcado `server-only`

lib/                        plataforma partilhada
  money.ts                  cêntimos inteiros, nunca vírgula flutuante
  time.ts                   dias úteis, fuso da Carol
  crypto.ts                 AES-GCM para os tokens de OAuth
  flags.ts                  bandeiras; o ambiente só as pode fechar
  supabase/                 browser, servidor, service role, tipos gerados

supabase/migrations/        aditivas, por ordem, reproduzíveis
```

A separação entre `domain.ts` e `service.ts` não é decorativa: as regras
comerciais têm de ser testáveis sem base de dados, e os componentes de cliente
têm de conseguir importar constantes sem arrastar o cliente de Supabase para o
browser.

## Base de dados

Migrações em `supabase/migrations/`, aditivas e por ordem. Nunca se apaga uma
coluna na mesma migração que introduz a substituta.

Aplicar num projeto novo:

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

As colunas antigas de `brand` (`stage`, `next_step`, `instagram`, `contact`)
continuam lá e continuam a funcionar. O modelo novo vive ao lado, em
`opportunity` e `action_item`, e o backfill preserva tudo.

## Ligar o Gmail

O lado da aplicação está pronto. Falta o cliente de OAuth, que só pode ser
criado numa conta Google:

1. [Google Cloud Console](https://console.cloud.google.com/) → criar projecto.
2. **APIs & Services → Library** → activar **Gmail API**.
3. **OAuth consent screen** → External → preencher; adicionar o e-mail da Carol
   em *Test users* enquanto a app estiver em modo de teste.
4. Scopes: `gmail.readonly` e `gmail.compose`. **Não** adicionar `gmail.send` —
   o sistema não envia nada sozinho, por desenho.
5. **Credentials → Create OAuth client ID → Web application**.
   Authorized redirect URI:
   `https://<domínio>/api/integrations/google/oauth/callback`
   (e `http://localhost:3000/...` para desenvolvimento).
6. Pôr `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no ambiente.
7. `/dashboard/settings` → **Ligar o Gmail**.

## Automação

Todas as bandeiras começam fechadas, excepto o modo sombra. A ordem para as
abrir está em `/dashboard/settings`, e é esta:

1. modo sombra ligado, tudo o resto fechado — o sistema observa e recomenda;
2. `gmail_ingestion`, depois do OAuth;
3. `ai_enabled` + `ai_classification`;
4. `ai_drafting`;
5. `background_jobs`, quando o cron estiver a correr;
6. `gmail_draft_creation`;
7. só no fim, e só depois de a Carol concordar com o que o sistema propunha:
   `auto_apply_low_risk` ligado e modo sombra desligado.

`external_send` fica fechada. O limite da automação é escrever um rascunho na
caixa dela.

As variáveis `CAROLOS_*_ENABLED` só conseguem **fechar** uma bandeira, nunca
abri-la. É assim que um preview não fala com o Gmail de produção mesmo que a
bandeira esteja ligada na base.

## Agendamento

O relógio não está na Vercel. O plano Hobby só permite **um cron por dia**, e o
Gmail precisa de ser visto de quinze em quinze minutos — baixar a frequência
para caber no plano seria estragar o produto para poupar configuração.

A Vercel aloja a aplicação; o Supabase agenda. `pg_cron` dispara, `pg_net` faz
o POST autenticado, e o endpoint corre o trabalho e confirma de volta.

| Trabalho | Frequência (UTC) | Porquê |
|---|---|---|
| Sincronizar o Gmail | 15/15 min, 06–21h | É o intervalo entre uma marca responder e a Carol saber. |
| Processar pendentes | 30/30 min | Mensagens por processar e extrações de IA que falharam. |
| Follow-ups | de hora a hora | Marca vencidos, semeia os que faltam. |
| Recalcular a fila | de hora a hora | O Hoje fresco sem ela abrir a aplicação. |
| Licenças | 1×/dia | Uma licença expira ao dia, não ao minuto. |
| Métricas | 1×/dia | Pede resultados de campanhas que já correram. |
| Upsell | 1×/dia | Avalia trabalhos aprovados que já assentaram. |
| Reconciliar | 5/5 min | Fecha disparos cuja resposta se perdeu. |

A janela 06–21 UTC cobre as 07h–21h de Lisboa nos dois lados da mudança de hora.

**Ligar:** define `APP_BASE_URL` e `CRON_SECRET` no ambiente e carrega em
*Ligar o agendador* em `/dashboard/settings`. O segredo é escrito no Vault do
Supabase por uma função `security definer` — nunca passa por SQL escrito à mão
nem fica em `app_setting`, e nunca volta ao browser.

Se algo falhar repetidamente, o disparo recua sozinho: 5, 10, 20… até 120
minutos, e uma hora inteira num 401, porque um erro de autenticação é
configuração e não se resolve a insistir.

**Não há `vercel.json` com crons, e não deve haver.** Dois agendadores para o
mesmo trabalho é a receita para duplicar sincronizações.

## Deploy

CD pela Vercel a partir do GitHub. CI em `.github/workflows/ci.yml`
(typecheck, lint, test, build em cada push e PR).

```bash
npx vercel link
npx vercel --prod
```

## Segurança

- Nada de segredos no repositório. Toda a configuração é por variável de ambiente.
- `SUPABASE_SERVICE_ROLE_KEY` só do lado do servidor, nunca com `NEXT_PUBLIC_`.
- Os refresh tokens do Google são cifrados antes de tocarem na base, e a tabela
  que os guarda tem RLS ligado sem política nenhuma: é alcançável só pelo
  service role.
- Todas as tabelas do CarolOS são privadas. O anónimo vê o conteúdo publicado do
  site e as media com nicho — mais nada.
