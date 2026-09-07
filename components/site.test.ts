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

test('«meus cenários» mostra várias fotos por vez, não uma página de cada vez', () => {
  const css = ler('app/site.css');
  assert.match(bloco(css, '.pgrid > li'), /var\(--cols\)/);
  assert.doesNotMatch(bloco(css, '.pgrid > li'), /flex: 0 0 100%/);
  assert.doesNotMatch(bloco(css, '.pgrid'), /max-width/);
  for (const [largura, cols] of [
    ['620px', '2'],
    ['900px', '3'],
    ['1080px', '4'],
  ]) {
    assert.match(
      css,
      new RegExp(
        `min-width: ${largura}\\) \\{\\n      \\.pgrid \\{\\n        --cols: ${cols};`,
      ),
      `a ${largura} devem passar ${cols} fotos de cada vez`,
    );
  }
});

test('o desfile das fotos anda sozinho e tem como o parar', () => {
  const src = ler('components/Photos.tsx');
  assert.match(src, /useReel\(\d+\)/);
  assert.match(src, /setAuto\(!auto\)/);
  const hook = ler('components/useReel.ts');
  assert.match(hook, /prefers-reduced-motion: reduce/);
  assert.match(hook, /if \(quieto \|\| document\.hidden\) return;/);
});

test('«produções» é uma grelha de três por linha no monitor', () => {
  const css = ler('app/site.css');
  assert.match(
    css,
    /min-width: 900px\) \{\n      #sessao \.sessGrid \{\n        grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/,
  );
});

test('«produções» tem título, não só a etiqueta', () => {
  const src = ler('components/Session.tsx');
  assert.match(src, /<h2 className="disp" id="sessaoTit">/);
  assert.match(src, /\{c\.titleLead\} <em className="serif-it">\{c\.titleEm\}<\/em>/);
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
  const sessao = motion.slice(0, motion.indexOf("video[data-src]"));
  assert.doesNotMatch(sessao, /\.play\(\)/, 'nada arranca os vídeos da sessão');
});
