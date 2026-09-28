import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { ALL_DESTINATIONS, SECTIONS, UTILITY, isCurrent, sectionFor } from './nav';

const ROOT = path.join(import.meta.dirname, '..', '..');

function routes(dir: string, prefix = ''): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    if (!e.isDirectory() || e.name.startsWith('[')) return [];
    const here = path.join(dir, e.name);
    const url = `${prefix}/${e.name}`;
    const own = readdirSync(here).includes('page.tsx') ? [`/dashboard${url}`] : [];
    return [...own, ...routes(here, url)];
  });
}

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

test('o primeiro nível tem somente Conteúdo e O site', () => {
  assert.deepEqual(SECTIONS.map((s) => s.label), ['Conteúdo', 'O site']);
  assert.equal(UTILITY.length, 0);
});

test('Conteúdo abre pela Semana e mantém somente a fatia atual', () => {
  const content = SECTIONS.find((s) => s.id === 'content');
  assert.ok(content);
  assert.deepEqual(content.items.map((i) => i.label), ['Semana', 'Mapa', 'Produção']);
  assert.equal(content.href, '/dashboard/content');
});

test('o gerenciador do site público permanece inteiro', () => {
  const site = SECTIONS.find((s) => s.id === 'site');
  assert.ok(site);
  assert.deepEqual(site.items.map((i) => i.href), [
    '/dashboard/site',
    '/dashboard/site/library',
    '/dashboard/site/links',
  ]);
});

test('nenhum destino aparece duas vezes', () => {
  const hrefs = ALL_DESTINATIONS.map((d) => d.href);
  assert.equal(new Set(hrefs).size, hrefs.length);
});

test('cada rota privada visível tem uma porta', () => {
  const all = routes(path.join(ROOT, 'app/dashboard/(app)'));
  const reachable = new Set([...ALL_DESTINATIONS.map((d) => d.href), ...linkedFromScreens(), '/dashboard']);
  const missing = all.filter((r) => !reachable.has(r));
  assert.deepEqual(missing, [], `sem porta: ${missing.join(', ')}`);
});

test('a seção acesa acompanha Conteúdo e Site', () => {
  assert.equal(sectionFor('/dashboard/content')?.id, 'content');
  assert.equal(sectionFor('/dashboard/content/map')?.id, 'content');
  assert.equal(sectionFor('/dashboard/content/production')?.id, 'content');
  assert.equal(sectionFor('/dashboard/site')?.id, 'site');
  assert.equal(sectionFor('/dashboard/site/library')?.id, 'site');
});

test('dashboard antigo não volta a ser prefixo de tudo', () => {
  assert.equal(isCurrent('/dashboard/content', '/dashboard'), false);
  assert.equal(isCurrent('/dashboard', '/dashboard'), true);
});
