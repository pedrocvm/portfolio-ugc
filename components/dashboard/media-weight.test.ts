import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.join(import.meta.dirname, '..', '..');
const ler = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

/** As telas que mostram mídia da biblioteca. Todas mostram vários vídeos ao
 *  mesmo tempo e todas já pediam o arquivo inteiro à chegada. */
const TELAS = [
  'components/dashboard/Library.tsx',
  'components/dashboard/LibraryPicker.tsx',
  'components/dashboard/MediaField.tsx',
  'components/dashboard/Fields.tsx',
];

test('nenhuma miniatura pede o vídeo à chegada', () => {
  for (const f of TELAS) {
    const src = ler(f);
    assert.doesNotMatch(
      src,
      /<video[^>]*\ssrc=\{/,
      `${f}: miniatura com src direto volta a puxar o arquivo todo ao abrir a tela`,
    );
    assert.match(src, /<VideoThumb src=\{/, `${f}: deveria usar VideoThumb`);
  }
});

test('a miniatura espera pela tela antes de gastar tráfego', () => {
  const src = ler('components/dashboard/VideoThumb.tsx');
  assert.match(src, /IntersectionObserver/, 'sem observador não há espera');
  assert.match(
    src,
    /preload=\{visible \? 'metadata' : 'none'\}/,
    'fora da tela o preload tem de ser none',
  );
  assert.match(
    src,
    /\{\.\.\.\(visible \? \{ src \} : \{\}\)\}/,
    'fora da tela o elemento não pode ter src',
  );
});

test('a prateleira de nichos não pré-carrega o que ninguém abriu', () => {
  const src = ler('components/Meet.tsx');
  assert.match(
    src,
    /playsInline\n                      preload="none"/,
    'a prateleira do site público voltaria a pedir metadata de cada vídeo do nicho',
  );
});

/** Os vídeos que a biblioteca guardou antes deste limiar existir iam de 6,8 MB
 *  a 18,9 MB, e nenhum foi comprimido: o limiar estava em 20 MB. Tem de ficar
 *  abaixo do mais leve deles, ou volta a deixar passar a biblioteca inteira. */
test('o limiar de compressão apanha um reel de celular', () => {
  const src = ler('components/dashboard/MediaField.tsx');
  const m = src.match(/const COMPRESS_OVER = (\d+) \* 1024 \* 1024;/);
  assert.ok(m, 'COMPRESS_OVER deixou de ser declarado em MB');
  assert.ok(
    Number(m[1]) <= 5,
    `limiar de ${m[1]} MB deixa passar os vídeos que encheram o Storage`,
  );
});
