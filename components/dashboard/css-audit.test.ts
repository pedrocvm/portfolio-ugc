import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** Os bugs P0 da auditoria de CSS, verificados como texto para não voltarem:
 *  um `<input class="osSearch">` sem invólucro, um botão flutuante que se
 *  posiciona sozinho, um cabeçalho de cartão que esmaga o texto. */

const ROOT = path.join(import.meta.dirname, '..', '..');
const ler = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const bloco = (css: string, selector: string) => {
  const i = css.indexOf(`\n${selector} {`);
  assert.ok(i >= 0, `falta ${selector}`);
  return css.slice(i, css.indexOf('}', i));
};

test('«osSearch» é um invólucro: nunca vai direto no campo', () => {
  const src = ler('components/dashboard/os/ContentVault.tsx');
  assert.doesNotMatch(src, /<(input|select)\s+className="osSearch/);
  const css = ler('app/dashboard/dashboard.css');
  assert.match(css, /\.dash \.osSearch input,\n\.dash \.osSearch select \{/);
  assert.match(css, /\.dash :where\(input:not\(\[type\]\)/, 'um <input> sem type recebe o mesmo estilo de campo');
});

test('os botões flutuantes vivem numa pilha e não se posicionam sozinhos', () => {
  const css = ler('app/dashboard/dashboard.css');
  for (const sel of ['.pvFab', '.capFab', '.aiLauncher']) {
    assert.doesNotMatch(bloco(css, sel), /position: fixed/, `${sel} não pode ser fixed por conta própria`);
  }
  assert.match(bloco(css, '.fabStack'), /position: fixed/);
  assert.match(ler('app/dashboard/(app)/layout.tsx'), /<div className="fabStack" id="fabStack">/);
  assert.match(ler('components/dashboard/Editor.tsx'), /createPortal\(verOSite, pilha\)/);
});

test('o cabeçalho do cartão quebra linha em vez de esmagar o resumo', () => {
  const css = ler('app/dashboard/dashboard.css');
  assert.match(bloco(css, '.cardHead'), /flex-wrap: wrap/);
  assert.match(bloco(css, '.cardHead .t'), /flex: 1 1 140px/);
});

test('em toque nenhum campo fica abaixo de 16px', () => {
  assert.match(ler('app/dashboard/dashboard.css'), /\.dash\.dash :is\(input, textarea, select\) \{\n\s+font-size: max\(16px, 1em\);/);
});

test('a folha da landing só carrega nas rotas públicas', () => {
  assert.match(ler('app/layout.tsx'), /import '\.\/base\.css';/);
  assert.doesNotMatch(ler('app/layout.tsx'), /site\.css|globals\.css/);
  assert.doesNotMatch(ler('app/dashboard/layout.tsx'), /site\.css/);
  for (const page of ['app/page.tsx', 'app/preview/page.tsx', 'app/contato/page.tsx']) {
    assert.match(ler(page), /site\.css';/, `${page} desenha a landing e precisa da folha dela`);
  }
  const site = ler('app/site.css');
  assert.match(site, /#hero/);
  assert.doesNotMatch(ler('app/base.css'), /#hero|#nav|#shelf/);
});

test('uma paleta, um nome por valor, e a escala de camadas só em base.css', () => {
  const base = ler('app/base.css');
  assert.match(base, /^@layer reset, tokens, base, layout, components, utilities, overrides;/m);
  assert.match(base, /@layer tokens \{\n  :root \{/);
  for (const t of ['--papel', '--areia2', '--pedra', '--umbra', '--tinta', '--grafite', '--ferro', '--jade', '--z-sticky', '--z-fab', '--z-modal', '--z-cmd']) {
    assert.match(base, new RegExp(`\\s${t}: `), `${t} nasce em base.css`);
  }
  const folhas = ['app/site.css', 'app/contato/links.css', 'app/dashboard/dashboard.css', 'app/dashboard/content-brain.css'];
  for (const f of folhas) {
    const css = ler(f);
    assert.doesNotMatch(css, /var\(--(paper|sandLight|stone|umber|graphite|ink|ink2|rule|rule2|t[1-4]|accent)\)/, `${f} usa nomes antigos`);
    assert.doesNotMatch(css, /^\s*--(paper|graphite|jade|z-[a-z]+):/m, `${f} redefine um token do base`);
    assert.doesNotMatch(css, /z-index:\s*-?\d{2,}/, `${f} tem z-index cru; usa a escala`);
  }
});

test('acessibilidade: contraste, alvos de toque, foco na paleta e um só bloco de movimento reduzido', () => {
  const base = ler('app/base.css');
  assert.match(base, /--jade-escuro: #4e6746;/);
  assert.match(base, /@media \(prefers-reduced-motion: reduce\) \{\n\s+\*,\n\s+::before,\n\s+::after \{\n\s+animation-duration: 0\.01ms !important;/);
  assert.doesNotMatch(base, /Ferly/, 'uma fonte que nunca carrega não se referencia');
  const dash = ler('app/dashboard/dashboard.css');
  assert.doesNotMatch(dash, /^\s*color: var\(--jade\);/m, 'jade só para fundos e filetes; para texto é --jade-escuro');
  assert.doesNotMatch(dash, /^\s*color: var\(--pedra\);/m, 'pedra como texto dá 2,6:1');
  assert.match(dash, /\.cmdBox:focus-within \{/);
  assert.match(dash, /@media \(pointer: coarse\) \{[\s\S]*width: max\(100%, 44px\);/);
  assert.doesNotMatch(dash, /transition: all/);
  for (const f of ['app/dashboard/dashboard.css', 'app/dashboard/content-brain.css', 'app/site.css', 'app/contato/links.css']) {
    const css = ler(f);
    assert.equal((css.match(/prefers-reduced-motion: reduce/g) || []).length, 1, `${f}: um bloco de movimento reduzido`);
    const fora = css.split('\n').filter((l, i, all) => l.includes('!important') && !all.slice(Math.max(0, i - 60), i).some((x) => x.includes('@media print')));
    assert.deepEqual(fora.filter((l) => !l.trim().startsWith('/*') && !l.includes('sem `!important`')), [], `${f}: !important fora de print`);
  }
});
