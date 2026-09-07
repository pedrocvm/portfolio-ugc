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
