import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

/** Guarda de regressão para o incidente do R2: uma leitura que falhou (402,
 *  rede, RLS quebrado) não pode voltar a virar DEFAULT_CONTENT em silêncio.
 *  Testar isto batendo num Supabase de verdade exigiria simular um 402; aqui
 *  a garantia é sobre a forma do código, no mesmo espírito de
 *  components/dashboard/media-weight.test.ts. */
const src = readFileSync(
  path.join(import.meta.dirname, 'content-store.ts'),
  'utf8',
);

test('erro de leitura sobe como excepção, não como null', () => {
  assert.match(
    src,
    /if \(error\) \{\s*throw new Error/,
    'um `error` da consulta devia rebentar em vez de cair no mesmo caminho de "sem linha"',
  );
});

test('só a ausência de erro E de dado é que é "vazio" legítimo', () => {
  assert.match(
    src,
    /if \(!data\) return null;/,
    'a checagem de vazio devia sobrar isolada, depois do erro já ter subido',
  );
  assert.doesNotMatch(
    src,
    /if \(error \|\| !data\) return null;/,
    'voltou a juntar erro e vazio no mesmo `return null` — é essa junção que fez o 402 parecer conteúdo por publicar',
  );
});

test('a leitura publicada não engole o erro para caber no cache', () => {
  assert.match(
    src,
    /const publicado = unstable_cache\(\s*async \(\) => \(await read\('published'\)\) \?\? DEFAULT_CONTENT,/,
    'se isto passar a ter um try/catch por baixo, confirma que ele deixa o erro subir — não pode gravar DEFAULT_CONTENT em cache por causa de uma falha',
  );
});

test('só quem decide degradar visivelmente pode engolir o erro', () => {
  assert.match(
    src,
    /export async function getPublishedOrDefault/,
    'as páginas públicas precisam de uma forma explícita de cair para DEFAULT_CONTENT — que não seja getPublished() direto',
  );
  assert.match(
    src,
    /degraded: true/,
    'a queda para DEFAULT_CONTENT tem de vir marcada, para a página avisar em vez de fingir que é conteúdo real',
  );
});

/* ── As duas páginas públicas não podem voltar a chamar getPublished() sem
   rede: isso faz a mesma leitura falhar o build inteiro (SSG) ou mostrar uma
   tela de erro sem aviso numa visita real, pela mesma causa que o incidente
   original — só que ao contrário do DEFAULT_CONTENT silencioso, dessa vez sem
   nada no ar. ── */
for (const pagina of ['../app/page.tsx', '../app/contato/page.tsx']) {
  test(`${pagina}: usa a queda visível, não getPublished() direto`, () => {
    const paginaSrc = readFileSync(
      path.join(import.meta.dirname, pagina),
      'utf8',
    );
    assert.match(paginaSrc, /getPublishedOrDefault/);
    assert.match(paginaSrc, /DegradedNotice/);
  });
}
