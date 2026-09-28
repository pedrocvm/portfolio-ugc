# portfolio-ugc · CarolOS

Esta aplicação contém duas superfícies.

- o portfólio público da Carol em `carolqueiroz.pt`
- o CarolOS, área privada para estratégia e produção de conteúdo

Stack principal

- Next.js App Router
- TypeScript
- Supabase
- Vercel
- gateway de IA já existente com Gemini e Anthropic

## Produto privado atual

O CarolOS foi simplificado deliberadamente.

A Carol não usa CRM, prospecção, inbox, receita, oportunidades, follow-ups ou
outros painéis antigos. Essas superfícies deixaram de fazer parte do produto
ativo.

A navegação privada atual tem somente

- **Conteúdo**
- **O site**

### Conteúdo

A primeira fatia implementa o núcleo editorial.

- Semana
- Mapa Editorial
- Produção das decisões já aprovadas

A Semana não é um calendário vazio. O Motor de Prioridades escolhe três
assuntos a partir do foco atual, mapa editorial e histórico recente. A IA
propõe ângulo, lente, formato e explicação. Carol pode Aprovar, Ajustar ou
Trocar.

A estratégia atual está registrada em

`docs/content-os/DECISIONS.md`

### O site

O editor do portfólio público continua completo em

`/dashboard/site`

com Biblioteca e Links.

## Instagram

A coleta do Instagram continua ativa mesmo antes da Auditoria voltar à
interface. Isso preserva mídias, Stories e snapshots que não podem ser
reconstruídos depois.

Os únicos jobs ativos depois do reset são

- `instagram-sync`
- `instagram-token`

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

O CI executa os quatro em cada pull request.

## Banco de dados

As migrations vivem em `supabase/migrations/` e são aditivas.

Para aplicar em um projeto ligado

```bash
npx supabase link --project-ref <ref>
npx supabase db push
```

Depois de migrations novas, os tipos podem ser regenerados com

```bash
npm run db:types
```

Nunca fazer reset da base de produção.

## Deploy

O deploy da aplicação é feito pela Vercel a partir do GitHub.

As migrations do Supabase não são aplicadas automaticamente pelo workflow do
GitHub deste repositório. A migration precisa estar aplicada antes de uma
versão que dependa das novas tabelas chegar à produção.

## Segurança

- nenhum segredo no repositório
- service role somente no servidor
- tokens de integração não vão para o browser
- nada publica conteúdo externamente sem decisão humana
- tabelas privadas mantêm RLS
