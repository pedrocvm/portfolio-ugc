import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SECTIONS, UTILITY, ALL_DESTINATIONS, sectionFor, isCurrent } from './nav';

/** A navegação é a única porta para a maior parte das telas: uma rota que fique
 *  de fora dela passa a existir só para quem souber o URL de cor.
 *
 *  O `nav.ts` importa-se à vontade — é uma tabela, não um componente. O que se
 *  continua a ler como texto são os ficheiros que puxavam o React e o
 *  `next/navigation` para dentro do runner. */

const ROOT = path.join(import.meta.dirname, '..', '..');

/** Nem tudo precisa de entrada na barra: uma sub-vista pertence ao ecrã que a
 *  abre. O que não pode existir é uma tela sem porta nenhuma — por isso vale
 *  também um link a partir de outra tela. */
function linkedFromScreens(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const here = path.join(dir, e.name);
      if (e.isDirectory()) walk(here);
      else if (/\.tsx$/.test(e.name)) {
        for (const m of readFileSync(here, 'utf8').matchAll(/href="(\/dashboard[^"]*)"/g)) found.push(m[1]);
      }
    }
  };
  walk(path.join(ROOT, 'components'));
  walk(path.join(ROOT, 'app'));
  return found;
}

/** Endereços antigos que só redirecionam para o sítio novo. Não levam a lado
 *  nenhum próprio, por isso não pertencem a barra nenhuma — mas também não são
 *  telas órfãs. */
const REDIRECTS = new Set(['/dashboard/library', '/dashboard/links']);

function routes(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (!e.isDirectory() || e.name.startsWith('[')) return [];
    const here = path.join(dir, e.name);
    const url = `${prefix}/${e.name}`;
    const own = readdirSync(here).includes('page.tsx') ? [`/dashboard${url}`] : [];
    return [...own, ...routes(here, url)];
  });
}

test('nenhuma tela do painel fica sem porta', () => {
  const all = routes(path.join(ROOT, 'app/dashboard/(app)'));
  const reachable = new Set([...ALL_DESTINATIONS.map((d) => d.href), ...linkedFromScreens()]);
  const missing = all.filter((r) => !reachable.has(r) && !REDIRECTS.has(r));
  assert.deepEqual(missing, [], `sem barra e sem link: ${missing.join(', ')}`);
});

test('nenhum destino aparece duas vezes', () => {
  const hrefs = ALL_DESTINATIONS.map((d) => d.href);
  assert.equal(new Set(hrefs).size, hrefs.length, `repetidos em ${hrefs.join(', ')}`);
});

/** O ponto de toda a reorganização. Se isto crescer, cresceu por descuido. */
test('o primeiro nível cabe de um olhar: cinco secções e duas utilidades', () => {
  assert.equal(SECTIONS.length, 5, `${SECTIONS.length} secções no carril`);
  assert.equal(UTILITY.length, 2, `${UTILITY.length} utilidades`);
});

test('cada secção leva a uma sub-área sua, não a um índice à parte', () => {
  for (const s of SECTIONS) {
    if (!s.items.length) continue;
    assert.ok(
      s.items.some((i) => i.href === s.href),
      `«${s.label}» aponta para ${s.href}, que não é nenhuma das suas sub-áreas`,
    );
  }
});

test('o Hoje não abre barra de secção nenhuma', () => {
  assert.equal(sectionFor('/dashboard')?.id, 'today');
  assert.equal(SECTIONS.find((s) => s.id === 'today')?.items.length, 0);
});

/** `sectionFor` devolve a primeira secção que casa. Isso só está certo
 *  enquanto nenhuma secção for prefixo de outra — a partir daí a ordem da
 *  tabela decidia em silêncio qual das duas ganhava. */
test('nenhuma secção é prefixo de outra', () => {
  for (const a of SECTIONS) {
    for (const b of SECTIONS) {
      if (a.id === b.id || a.href === '/dashboard') continue;
      const dentro = [b.href, ...b.items.map((i) => i.href)];
      for (const href of dentro) {
        assert.ok(
          !isCurrent(href, a.href),
          `«${b.label}» tem ${href}, que cai dentro de «${a.label}» (${a.href})`,
        );
      }
    }
  }
});

test('cada sub-área pertence à secção que a lista', () => {
  assert.equal(sectionFor('/dashboard/site/links')?.id, 'site');
  assert.equal(sectionFor('/dashboard/outreach/history')?.id, 'prospecting');
  assert.equal(sectionFor('/dashboard/inbox')?.id, 'work');
  assert.equal(sectionFor('/dashboard/revenue')?.id, 'money');
});

test('uma tela de detalhe mantém acesa a secção a que pertence', () => {
  assert.equal(sectionFor('/dashboard/opportunities/abc-123')?.id, 'work');
  assert.equal(sectionFor('/dashboard/brands/abc-123')?.id, 'work');
  assert.equal(sectionFor('/dashboard/production/abc-123')?.id, 'work');
});

test('uma rota fora das secções não acende nenhuma', () => {
  assert.equal(sectionFor('/dashboard/settings'), null);
  assert.equal(sectionFor('/dashboard/capture'), null);
});

test('«/dashboard» só está ativo em si mesmo', () => {
  assert.equal(isCurrent('/dashboard/inbox', '/dashboard'), false);
  assert.equal(isCurrent('/dashboard', '/dashboard'), true);
  assert.equal(isCurrent('/dashboard/site/links', '/dashboard/site'), true);
});

/** Lido como texto pela mesma razão de sempre: importar a action puxa o
 *  Supabase e o `next/cache` para dentro do runner. */
test('a corrida a mostrar escolhe-se pelo instante, não pelo dia', () => {
  // Várias corridas partilham a mesma `run_date` — o cron da manhã e cada
  // «procurar agora». Ordenar por dia empata, o Postgres devolve uma qualquer, e
  // a busca que ela acabou de fazer parece não ter aparecido.
  const actions = readFileSync(path.join(ROOT, 'app/dashboard/outreach-actions.ts'), 'utf8');
  const ordenacoes = [...actions.matchAll(/\.from\('outreach_run'\)[\s\S]{0,400}?\.order\('(\w+)'/g)];
  assert.ok(ordenacoes.length >= 2, `só encontrei ${ordenacoes.length} leituras de outreach_run`);
  for (const [, coluna] of ordenacoes) {
    assert.equal(coluna, 'started_at', `ordenou outreach_run por «${coluna}»`);
  }
});

/** Lido como texto porque exercitar um hook precisava de um renderer que este
 *  runner não tem. É mais fraco do que eu queria: garante a forma da correção,
 *  não o comportamento. O bug real era o menu do celular abrir e fechar-se
 *  sozinho a partir da segunda vez, e seis componentes partilhavam-no. */
test('a animação de saída repõe-se, e não se reagenda a cada render', () => {
  const hook = readFileSync(path.join(ROOT, 'components/dashboard/useExit.ts'), 'utf8');

  assert.match(hook, /setClosing\(false\)/, 'o estado de saída fica preso e a próxima abertura nasce a fechar');

  // `onDone` nas dependências reagenda o fecho a cada render enquanto fecha.
  const deps = /\}, \[([^\]]*)\]\);/.exec(hook)?.[1] ?? '';
  assert.doesNotMatch(deps, /onDone/, `onDone voltou às dependências: [${deps}]`);
  assert.match(hook, /useRef\(onDone\)/, 'sem ref, o efeito volta a depender de uma função instável');
});

/** O ficheiro tinha trinta e seis durações escolhidas uma a uma. O teste não
 *  julga o gosto: só impede que uma transição volte a nascer com um número
 *  solto ao lado das que passaram a token. */
test('nenhuma transição do painel traz duração à mão', () => {
  const css = readFileSync(path.join(ROOT, 'app/dashboard/dashboard.css'), 'utf8');
  const soltas: string[] = [];
  for (const m of css.matchAll(/transition(?:-duration)?\s*:[^;}]*/g)) {
    // `0.01ms` é o desligar do `prefers-reduced-motion`, e é para ficar.
    if (/\b\d*\.?\d+s\b/.test(m[0])) soltas.push(m[0].trim());
  }
  assert.deepEqual(soltas, [], `fora da escada de tempo: ${soltas.join(' | ')}`);
});
