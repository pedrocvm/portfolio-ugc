# portfolio-ugc · CarolOS

Uma aplicação, duas superfícies:

- **carolqueiroz.pt**, o portfólio público da Carol;
- **CarolOS**, a área privada de estratégia e produção de conteúdo.

Next.js App Router + TypeScript + Supabase, com deploy na Vercel.

## Escopo atual

O CarolOS foi reduzido de propósito.

A Carol não usava o CRM, inbox, prospecção, funil, dinheiro, pricing, direitos ou a operação comercial que existia antes. Essas superfícies saíram do produto. O que continua é o que ela realmente usa ou decidiu usar agora:

- **Conteúdo**: Semana, Mapa, Produção, Laboratório e Auditoria;
- **O site**: editor, biblioteca de mídia e links do portfólio público.

Não reintroduza uma área antiga só porque o código histórico ainda existe. Uma feature volta apenas depois de existir uso real para ela.

## Conteúdo

A fonte de verdade funcional é a estratégia de conteúdo consolidada em 28/09/2026.

O fluxo é:

```
Mapa editorial
  → Motor de Prioridades
  → três propostas da semana
  → validação da Carol
  → Production Pack
  → validação do material
  → produção
  → publicação
  → Instagram / métricas
  → aprendizado
  → próxima semana
```

Cinco dimensões permanecem separadas:

- **pilar**: UGC como fonte de renda, Experiências, Casa;
- **objetivo**: Atrair, Reter, Provar, Converter;
- **lente**: Quem sou, Como penso, O que faço;
- **formato**: Reel, carrossel, sequência de fotos, Stories etc.;
- **modalidade comercial**: Tech UGC, Canvas UGC ou nenhuma.

Tech UGC e Canvas UGC têm o mesmo peso inicial. O foco comercial é SaaS e apps que atendem negócios locais.

A capacidade padrão é **3 posts por semana**. Quatro não é obrigação.

Nenhuma peça chega a “pronto para produzir” sem validação humana.

## Desenvolvimento

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Gates

```bash
npm run typecheck
npm run lint
npm run test
npm run build
```

A avaliação contra modelo real fica fora do CI:

```bash
npm run eval:content
```

## Estrutura principal

```
app/
  page.tsx, contato/            portfólio público
  dashboard/(app)/
    content/                    CarolOS atual
    site/                       editor do site público
  api/
    integrations/instagram/     OAuth, callbacks e webhook da Meta
    jobs/[job]/                 trabalhos de conteúdo
    track/                      analytics do site

modules/
  content-brain/                estratégia, prioridade, produção, auditoria, aprendizado
  integrations/instagram/       único cliente da Graph API
  jobs/                         apenas jobs ainda usados pelo Conteúdo

lib/
  content-store.ts              conteúdo publicado e rascunho do site
  supabase/                     clientes e tipos

supabase/migrations/            histórico aditivo; migrations antigas não são apagadas
```

## Instagram

A integração Meta é parte estrutural do novo CarolOS.

Ela alimenta:

- mídia e Stories;
- snapshots;
- Auditoria;
- qualidade da comunidade;
- experimentos;
- learning loop.

Ausência de métrica continua sendo `NULL`, nunca zero.

Trial Reel não é inferido pela API. Quando existir, é fato do próprio CarolOS.

## Trabalhos de fundo

O agendador mantém apenas:

- sincronização do Instagram;
- renovação do token;
- leitura da comunidade;
- aprendizado;
- auditoria;
- montagem semanal;
- reconciliação de disparos.

O relógio continua no Supabase com `pg_cron` + `pg_net`. Não adicionar cron da Vercel em paralelo.

## Banco

Migrações são aditivas e ordenadas.

Não apagar migrations antigas para “limpar” o CRM removido. Elas fazem parte da história da base e precisam continuar reproduzíveis. Código e UI podem desaparecer sem reescrever o passado do banco.

Depois de aplicar `20260928001_carolos_content_strategy.sql` e as migrations posteriores, regenerar os tipos:

```bash
npm run db:types
```

## Segurança

- nenhum segredo no repositório;
- service role somente no servidor;
- tokens de integração nunca chegam ao browser;
- a área privada exige sessão;
- nada publica conteúdo automaticamente em nome da Carol;
- o site público lê somente conteúdo publicado.

## Regra de produto

O CarolOS não deve criar manutenção para a Carol.

Se uma feature depender de ela alimentar um sistema por obrigação, ou se não resolver um uso que ela reconhece, ela não entra.
