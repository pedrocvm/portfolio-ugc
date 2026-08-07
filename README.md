# portfolio-ugc

Portfólio de Carol Queiroz — UGC Creator. Next.js (App Router) + TypeScript, estático.

## Desenvolvimento

```bash
npm install
npm run dev          # http://localhost:3000
```

## Gates

```bash
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run build        # next build
```

## Estrutura

```
app/          layout, página, folha de estilos global
components/   uma secção por ficheiro; Motion.tsx concentra o GSAP
lib/site.ts   conteúdo e dados (pacotes, FAQ, nichos, imagens, links)
public/img/   fotografias
```

Alterar preços, perguntas do FAQ ou a lista de nichos faz-se em `lib/site.ts`,
sem tocar nos componentes.

## Deploy

CD pela Vercel a partir do GitHub. CI em `.github/workflows/ci.yml`
(typecheck + lint + build em cada push e PR).

```bash
npx vercel link
npx vercel --prod
```
