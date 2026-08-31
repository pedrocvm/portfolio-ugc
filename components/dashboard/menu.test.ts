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

/** Restos anteriores ao CarolOS: continuam a responder, ninguém lhes chama.
 *  Ficam nomeados aqui para o teste não passar por distracção. */
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

test('todas as telas do painel têm entrada no menu', () => {
  const all = routes(path.join(ROOT, 'app/dashboard/(app)'));
  const missing = all.filter((r) => !hrefs.includes(r) && !UNLINKED.has(r));
  assert.deepEqual(missing, [], `sem entrada no menu: ${missing.join(', ')}`);
});

test('nenhum destino aparece duas vezes', () => {
  assert.equal(new Set(hrefs).size, hrefs.length, `repetidos em ${hrefs.join(', ')}`);
});

test('«Hoje» e «Captura» ficam fora dos grupos, sempre à vista', () => {
  const pinned = MENU.slice(MENU.indexOf('export const PINNED'), MENU.indexOf('export const GROUPS'));
  assert.match(pinned, /'\/dashboard'/);
  assert.match(pinned, /'\/dashboard\/capture'/);
});

test('o menu cabe: no máximo cinco grupos, nenhum com mais de cinco entradas', () => {
  const groups = [...MENU.matchAll(/group: '([^']+)',\s*items: \[([\s\S]*?)\],/g)];
  assert.ok(groups.length <= 5, `${groups.length} grupos`);
  for (const [, name, body] of groups) {
    const n = [...body.matchAll(/href:/g)].length;
    assert.ok(n <= 5, `o grupo «${name}» tem ${n} entradas`);
  }
});
