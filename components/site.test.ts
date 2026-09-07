import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { DEFAULT_CONTENT } from '../lib/content.ts';
import { merge } from '../lib/merge.ts';

const ROOT = path.join(import.meta.dirname, '..');
const ler = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const bloco = (css: string, selector: string) => {
  const i = css.indexOf(`\n    ${selector} {`);
  assert.ok(i >= 0, `falta ${selector}`);
  return css.slice(i, css.indexOf('}', i));
};
const colunas = (css: string, largura: string, quantas: string) =>
  assert.match(
    css,
    new RegExp(
      `min-width: ${largura}\\) \\{\\n      \\.pgrid \\{\\n(        --gap: \\d+px;\\n)?        grid-template-columns: repeat\\(${quantas}, minmax\\(0, 1fr\\)\\);`,
    ),
    `a ${largura} a grelha das fotos deve ter ${quantas} colunas`,
  );

test('«meus cenários» é uma grelha, não um desfile lateral', () => {
  const css = ler('app/site.css');
  const g = bloco(css, '.pgrid');
  assert.match(g, /display: grid/);
  assert.match(g, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(g, /overflow-x|scroll-snap|display: flex/);
  colunas(css, '620px', '3');
  colunas(css, '1080px', '4');
});

test('nada anda sozinho em «meus cenários»', () => {
  const src = ler('components/Photos.tsx');
  assert.doesNotMatch(src, /useReel|setAuto|setInterval/);
  assert.doesNotMatch(ler('components/useReel.ts'), /setInterval/);
});

test('as fotos guardam a forma em qualquer largura', () => {
  const css = ler('app/site.css');
  assert.match(bloco(css, '.pgrid button'), /aspect-ratio: 4\/5/);
  assert.match(bloco(css, '.pgrid img'), /object-fit: cover/);
});

test('«produções» é uma grelha de três por linha no monitor', () => {
  const css = ler('app/site.css');
  assert.match(
    css,
    /min-width: 900px\) \{\n      #sessao \.sessGrid \{\n        grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  );
  assert.match(bloco(css, '#sessao .takeCard'), /aspect-ratio: 9\/16/);
});

test('«produções» tem título, não só a etiqueta', () => {
  const src = ler('components/Session.tsx');
  assert.match(src, /<h2 className="disp" id="sessaoTit">/);
  assert.match(
    src,
    /\{c\.titleLead\} <em className="serif-it">\{c\.titleEm\}<\/em>/,
  );
  assert.ok(DEFAULT_CONTENT.session.titleLead);
  assert.ok(DEFAULT_CONTENT.session.titleEm);
});

test('o título de «produções» aparece no que já estava salvo sem ele', () => {
  const salvo = { session: { label: 'Produções', takes: [] } };
  const out = merge(DEFAULT_CONTENT, salvo);
  assert.equal(out.session.label, 'Produções');
  assert.equal(out.session.titleLead, DEFAULT_CONTENT.session.titleLead);
  assert.equal(out.session.titleEm, DEFAULT_CONTENT.session.titleEm);
});

test('os vídeos de «produções» só tocam a pedido', () => {
  assert.doesNotMatch(ler('components/Session.tsx'), /autoPlay|muted/);
  const motion = ler('components/Motion.tsx');
  const sessao = motion.slice(0, motion.indexOf('video[data-src]'));
  assert.doesNotMatch(sessao, /\.play\(\)/, 'nada arranca os vídeos da sessão');
});
