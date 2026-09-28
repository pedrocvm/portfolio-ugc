import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const ler = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

test('a área privada carrega somente a folha base do dashboard', () => {
  const layout = ler('app/dashboard/layout.tsx');
  assert.match(layout, /import '\.\/dashboard\.css';/);
  assert.doesNotMatch(layout, /content-brain\.css/);
});

test('a landing continua isolada da área privada', () => {
  assert.match(ler('app/layout.tsx'), /import '\.\/base\.css';/);
  assert.doesNotMatch(ler('app/layout.tsx'), /site\.css|dashboard\.css/);
  assert.doesNotMatch(ler('app/dashboard/layout.tsx'), /site\.css/);
  for (const page of ['app/page.tsx', 'app/preview/page.tsx', 'app/contato/page.tsx']) {
    assert.match(ler(page), /site\.css';/, `${page} precisa da folha pública`);
  }
});

test('a paleta e a escala de camadas continuam centralizadas em base.css', () => {
  const base = ler('app/base.css');
  assert.match(base, /^@layer reset, tokens, base, layout, components, utilities, overrides;/m);
  for (const t of ['--papel', '--areia2', '--tinta', '--ferro', '--z-sticky', '--z-fab', '--z-modal']) {
    assert.match(base, new RegExp(`\\s${t}: `), `${t} nasce em base.css`);
  }
  const dash = ler('app/dashboard/dashboard.css');
  assert.doesNotMatch(dash, /transition: all/);
});

test('o mobile mantém alvos de toque e a nova barra tem saída', () => {
  const css = ler('app/dashboard/dashboard.css');
  assert.match(css, /\.tabbar a,\n\s+\.tabbar button \{/);
  assert.match(css, /min-height: 48px/);
  assert.match(css, /\.tabOut,/);
  assert.match(ler('components/dashboard/MobileNav.tsx'), /className="tabOut"/);
});

test('o gerenciador do site mantém carregamento econômico de vídeo', () => {
  const src = ler('components/dashboard/VideoThumb.tsx');
  assert.match(src, /IntersectionObserver/);
  assert.match(src, /preload=\{visible \? 'metadata' : 'none'\}/);
});
