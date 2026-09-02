import assert from 'node:assert/strict';
import test from 'node:test';

import {
  asDate,
  dedupeReferences,
  freshnessOf,
  normalizeReferenceUrl,
  rankReferences,
  referenceIsUsable,
  referenceProblems,
  scoreReference,
  type Reference,
  type ReferenceLink,
} from './domain';

const NOW = new Date('2026-09-02T00:00:00Z');

const ref = (over: Partial<Reference> = {}): Reference => ({
  sourceUrl: 'https://www.tiktok.com/@alguem/video/123',
  platform: 'tiktok',
  title: 'Robô de limpeza',
  hook: 'Comecei a limpar a janela à mão e parei a meio.',
  structure: 'problema, tentativa frustrada, produto, resolução',
  editingStyle: 'jump cuts, zoom punch no remate, legenda grande',
  whyItWorks: 'A frustração é reconhecível e o produto entra como alívio, não como anúncio.',
  format: 'talking head + demo',
  publishedAt: '2026-08-20',
  durationSeconds: 28,
  creatorHandle: '@alguem',
  brandName: null,
  signals: [],
  sourceConfidence: 'reported',
  ...over,
});

const link = (over: Partial<ReferenceLink> = {}): ReferenceLink => ({
  fitReason: 'A Cecotec vende exactamente o robô que resolve esta frustração.',
  adaptation:
    'Abrir a limpar a janela do apartamento à mão, parar a meio e lembrar que tem o robô da Cecotec.',
  doNotCopy: 'Não repetir a fala nem a música: a estrutura é que se aproveita.',
  ...over,
});

test('sem data não se inventa frescura', () => {
  assert.equal(freshnessOf(null, NOW), 'unknown');
  assert.equal(freshnessOf('não é uma data', NOW), 'unknown');
});

test('a frescura mede-se em dias, não em opinião', () => {
  assert.equal(freshnessOf('2026-08-25', NOW), 'fresh');
  assert.equal(freshnessOf('2026-07-01', NOW), 'recent');
  assert.equal(freshnessOf('2026-03-01', NOW), 'aging');
  assert.equal(freshnessOf('2025-01-01', NOW), 'stale');
});

test('uma referência sem endereço não é uma referência', () => {
  const problemas = referenceProblems(ref({ sourceUrl: 'vi no TikTok' }));
  assert.ok(problemas.includes('sem endereço verificável'));
  assert.equal(referenceIsUsable(ref({ sourceUrl: 'vi no TikTok' })), false);
});

test('uma referência sem análise é um link, e um link não poupa trabalho', () => {
  assert.ok(referenceProblems(ref({ whyItWorks: 'boa' })).includes('sem explicação do que a faz funcionar'));
  assert.ok(
    referenceProblems(ref({ structure: '', hook: '' })).includes(
      'sem estrutura nem gancho — não há nada para adaptar',
    ),
  );
});

/* ── O que a primeira corrida real apanhou ────────────────────────────────
   Nove pesquisas, três referências analisadas, zero guardadas. As duas causas
   estavam ambas do meu lado. */

test('uma data em prosa não vai para uma coluna de data', () => {
  // «13 de maio de 2026» fazia o INSERT rebentar, e o erro era engolido.
  assert.equal(asDate('13 de maio de 2026'), null);
  assert.equal(asDate('25 de agosto de 2026'), null);
  assert.equal(asDate('há duas semanas'), null);
  assert.equal(asDate(''), null);
  assert.equal(asDate(null), null);
  assert.equal(asDate('2026-08-26'), '2026-08-26');
  assert.equal(asDate('2026-08-26T10:00:00Z'), '2026-08-26');
  assert.equal(asDate('2026-13-45'), null);
});

test('um endereço de exemplo não passa por endereço', () => {
  // Isto tem esquema, tem ponto e não tem espaços: passava em qualquer teste
  // de forma e não leva a lado nenhum. O prompt proíbe inventar links, e o
  // modelo obedeceu escrevendo reticências.
  const exemplo = referenceProblems(ref({ sourceUrl: 'https://www.youtube.com/watch?v=...' }));
  assert.ok(exemplo.includes('o endereço é um exemplo, não um vídeo'), exemplo.join('; '));

  for (const falso of [
    'https://www.tiktok.com/@user/video/VIDEO_ID',
    'https://instagram.com/reel/xxxxx',
    'https://example.com/reel/{id}',
    'https://tiktok.com/@exemplo/video/123',
  ]) {
    assert.equal(referenceIsUsable(ref({ sourceUrl: falso })), false, falso);
  }
});

test('um endereço verdadeiro continua a passar', () => {
  assert.equal(referenceIsUsable(ref({ sourceUrl: 'https://www.facebook.com/watch/?v=3097483783856230' })), true);
  assert.equal(referenceIsUsable(ref({ sourceUrl: 'https://www.tiktok.com/@alguem/video/7412345678901234567' })), true);
});

test('uma referência completa passa', () => {
  assert.deepEqual(referenceProblems(ref()), []);
});

test('o endereço normaliza para a mesma referência não entrar duas vezes', () => {
  assert.equal(
    normalizeReferenceUrl('https://www.tiktok.com/@alguem/video/123?utm_source=x&is_from_webapp=1'),
    'https://tiktok.com/@alguem/video/123',
  );
  // O id do vídeo está no caminho: dois vídeos do mesmo criador não colapsam.
  assert.notEqual(
    normalizeReferenceUrl('https://tiktok.com/@alguem/video/123'),
    normalizeReferenceUrl('https://tiktok.com/@alguem/video/456'),
  );
});

test('a deduplicação usa o endereço normalizado', () => {
  const lista = dedupeReferences([
    { sourceUrl: 'https://www.instagram.com/reel/ABC/?igshid=1' },
    { sourceUrl: 'https://instagram.com/reel/ABC' },
    { sourceUrl: 'https://instagram.com/reel/XYZ' },
  ]);
  assert.equal(lista.length, 2);
});

test('três milhões de visualizações não fazem uma boa referência', () => {
  // Nada aqui olha para métricas: o que conta é transferível, gravável e
  // recente. Uma produção com equipa perde para uma ideia adaptável.
  const comEquipa = scoreReference(
    ref({ structure: 'plano de drone sobre a cidade, equipa de três pessoas' }),
    link(),
    NOW,
  );
  const emCasa = scoreReference(ref(), link(), NOW);
  assert.ok(emCasa.score > comEquipa.score, `${emCasa.score} vs ${comEquipa.score}`);
  assert.ok(comEquipa.lines.some((l) => l.includes('produção que ela não tem')));
});

test('sem adaptação a referência vale menos do que com', () => {
  const com = scoreReference(ref(), link(), NOW);
  const sem = scoreReference(ref(), link({ adaptation: '' }), NOW);
  assert.ok(com.score > sem.score);
  assert.ok(sem.lines.some((l) => l.includes('Sem adaptação')));
});

test('uma referência antiga desce', () => {
  const nova = scoreReference(ref({ publishedAt: '2026-08-25' }), link(), NOW);
  const velha = scoreReference(ref({ publishedAt: '2024-01-01' }), link(), NOW);
  assert.ok(nova.score > velha.score);
});

test('o ranking corta em três e deixa as inúteis de fora', () => {
  const items = [
    { ref: ref({ sourceUrl: 'https://tiktok.com/@a/video/1' }), link: link() },
    { ref: ref({ sourceUrl: 'https://tiktok.com/@a/video/2', publishedAt: '2024-01-01' }), link: link() },
    { ref: ref({ sourceUrl: 'https://tiktok.com/@a/video/3' }), link: link({ adaptation: '' }) },
    { ref: ref({ sourceUrl: 'https://tiktok.com/@a/video/4' }), link: link() },
    // Esta não tem endereço: nunca entra, esteja onde estiver na lista.
    { ref: ref({ sourceUrl: 'vi algures' }), link: link() },
  ];
  const top = rankReferences(items, { max: 3, now: NOW });
  assert.equal(top.length, 3);
  assert.equal(
    top.every((t) => t.ref.sourceUrl.startsWith('https://')),
    true,
  );
  assert.ok(top[0].score >= top[1].score && top[1].score >= top[2].score);
});
