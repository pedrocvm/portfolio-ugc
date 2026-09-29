import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { SECTIONS, UTILITY, ALL_DESTINATIONS, sectionFor, isCurrent } from './nav';

const ROOT = path.join(import.meta.dirname, '..', '..');

function linkedFromScreens(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const here = path.join(dir, e.name);
      if (e.isDirectory()) walk(here);
      else if (/\.tsx$/.test(e.name)) {
        for (const m of readFileSync(here, 'utf8').matchAll(/href="(\/dashboard[^"]*)"/g)) {
          found.push(m[1]);
        }
      }
    }
  };
  walk(path.join(ROOT, 'components'));
  walk(path.join(ROOT, 'app'));
  return found;
}

function routes(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (!e.isDirectory() || e.name.startsWith('[')) return [];
    const here = path.join(dir, e.name);
    const url = `${prefix}/${e.name}`;
    const own = readdirSync(here).includes('page.tsx') ? [`/dashboard${url}`] : [];
    return [...own, ...routes(here, url)];
  });
}

test('a área privada só tem Conteúdo e O site', () => {
  assert.deepEqual(SECTIONS.map((s) => s.label), ['Conteúdo', 'O site']);
  assert.equal(UTILITY.length, 0);
});

test('nenhuma tela privada fica órfã', () => {
  const all = routes(path.join(ROOT, 'app/dashboard/(app)'));
  const reachable = new Set([...ALL_DESTINATIONS.map((d) => d.href), ...linkedFromScreens()]);
  const missing = all.filter((r) => !reachable.has(r));
  assert.deepEqual(missing, [], `sem porta: ${missing.join(', ')}`);
});

test('nenhum destino aparece duas vezes', () => {
  const hrefs = ALL_DESTINATIONS.map((d) => d.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test('as subáreas do site continuam dentro de O site', () => {
  assert.equal(sectionFor('/dashboard/site')?.id, 'site');
  assert.equal(sectionFor('/dashboard/site/library')?.id, 'site');
  assert.equal(sectionFor('/dashboard/site/links')?.id, 'site');
  assert.equal(sectionFor('/dashboard/content')?.id, 'content');
});

test('uma seção não acende a outra', () => {
  assert.equal(isCurrent('/dashboard/site', '/dashboard/content'), false);
  assert.equal(isCurrent('/dashboard/site/links', '/dashboard/site'), true);
});

test('a animação de saída repõe o estado', () => {
  const hook = readFileSync(path.join(ROOT, 'components/dashboard/useExit.ts'), 'utf8');
  assert.match(hook, /setClosing\(false\)/);
  assert.match(hook, /useRef\(onDone\)/);
});

test('nenhuma transição do painel traz duração solta', () => {
  const css = readFileSync(path.join(ROOT, 'app/dashboard/dashboard.css'), 'utf8');
  const loose: string[] = [];
  for (const m of css.matchAll(/transition(?:-duration)?\s*:[^;} ]*[^;}]*?/g)) {
    if (/\b\d*\.?\d+s\b/.test(m[0])) loose.push(m[0].trim());
  }
  assert.deepEqual(loose, []);
});
