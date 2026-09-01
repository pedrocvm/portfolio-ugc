import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** O menu é a única porta para a maior parte das telas: uma rota que fique de
 *  fora dele passa a existir só para quem souber o URL de cor. Isto lê o menu
 *  como texto de propósito — importá-lo puxava o React e o next/navigation
 *  para dentro do test runner. */

const ROOT = path.join(import.meta.dirname, '..', '..');
const MENU = readFileSync(path.join(ROOT, 'components/dashboard/Menu.tsx'), 'utf8');

const hrefs = [...MENU.matchAll(/href: '([^']+)'/g)].map((m) => m[1]);

/** Nem tudo precisa de entrada no menu: uma sub-vista pertence ao ecrã que a
 *  abre, e enfiá-la no carril é como o menu deixa de caber. O que não pode
 *  existir é uma tela sem porta nenhuma — por isso vale também um link a partir
 *  de outra tela. */
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

/** Restos anteriores ao CarolOS: continuam a responder, ninguém lhes chama.
 *  Ficam nomeados aqui para o teste não passar por distração. */
const UNLINKED = new Set(['/dashboard/funnel', '/dashboard/library', '/dashboard/links']);

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
  const reachable = new Set([...hrefs, ...linkedFromScreens()]);
  const missing = all.filter((r) => !reachable.has(r) && !UNLINKED.has(r));
  assert.deepEqual(missing, [], `sem menu e sem link: ${missing.join(', ')}`);
});

test('nenhum destino aparece duas vezes', () => {
  assert.equal(new Set(hrefs).size, hrefs.length, `repetidos em ${hrefs.join(', ')}`);
});

test('«Hoje» e «Captura» ficam fora dos grupos, sempre à vista', () => {
  const pinned = MENU.slice(MENU.indexOf('export const PINNED'), MENU.indexOf('export const GROUPS'));
  assert.match(pinned, /'\/dashboard'/);
  assert.match(pinned, /'\/dashboard\/capture'/);
});

test('o menu cabe: no máximo cinco grupos, nenhum com mais de seis entradas', () => {
  // Seis e não cinco: com o acordeão só um grupo está aberto de cada vez, e
  // medido a 1280x800 o carril ainda cabe com o maior grupo aberto. O limite
  // existe para travar o crescimento, não para o proibir.
  const groups = [...MENU.matchAll(/group: '([^']+)',\s*items: \[([\s\S]*?)\],/g)];
  assert.ok(groups.length <= 5, `${groups.length} grupos`);
  for (const [, name, body] of groups) {
    const n = [...body.matchAll(/href:/g)].length;
    assert.ok(n <= 6, `o grupo «${name}» tem ${n} entradas`);
  }
});

/** Lido como texto pela mesma razão que o menu: importar a action puxa o
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
