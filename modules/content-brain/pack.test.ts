import assert from 'node:assert/strict';
import test from 'node:test';

import { PACK_DELIVERABLES, PACK_KINDS, emptyPack, packGaps, packIsReady, packKindFor, parsePack } from './pack';
import { canTransition, pipelineBreaches, nextStatuses } from './pipeline';

/* ── Qual pack para qual peça ─────────────────────────────────────────────── */

test('o pack muda com o formato, e a modalidade comercial ganha ao recipiente', () => {
  assert.equal(packKindFor('reel', 'none'), 'spoken_reel');
  assert.equal(packKindFor('reel', 'tech_ugc'), 'tech_ugc');
  assert.equal(packKindFor('reel', 'canvas_ugc'), 'canvas_ugc');
  assert.equal(packKindFor('carousel', 'none'), 'carousel');
  assert.equal(packKindFor('photo_sequence', 'none'), 'photo_sequence');
  assert.equal(packKindFor('story', 'none'), 'story_sequence');
});

test('não existe um formulário universal: cada tipo pede coisas diferentes', () => {
  const listas = PACK_KINDS.map((k) => PACK_DELIVERABLES[k].join('|'));
  assert.equal(new Set(listas).size, PACK_KINDS.length);
  assert.ok(PACK_DELIVERABLES.carousel.includes('paleta'));
  assert.ok(!PACK_DELIVERABLES.spoken_reel.includes('paleta'));
  assert.ok(!PACK_DELIVERABLES.carousel.some((d) => d.includes('frase por frase')));
});

/* ── Reel falado ──────────────────────────────────────────────────────────── */

test('o Reel falado exige fala frase por frase', () => {
  const sem = parsePack('spoken_reel', { hook: 'olha isso', lines: [] });
  assert.equal(sem.ok, false);

  const com = parsePack('spoken_reel', { hook: 'olha isso', lines: [{ text: 'primeira frase' }] });
  assert.equal(com.ok, true);
});

test('um roteiro com frase vazia não está pronto', () => {
  const p = parsePack('spoken_reel', { hook: 'x', lines: [{ text: 'a' }] });
  assert.ok(p.ok);
  assert.equal(packIsReady(p.pack), true);

  const vazio = emptyPack('spoken_reel');
  if (vazio.kind === 'spoken_reel') vazio.body.hook = '';
  assert.ok(packGaps(vazio).includes('falta o gancho'));
});

test('o CTA é opcional e, quando entra, tem de dizer porquê', () => {
  const ok = parsePack('spoken_reel', {
    hook: 'x', lines: [{ text: 'a' }],
    cta: { text: 'me chama no direct', because: 'o objetivo é converter' },
  });
  assert.ok(ok.ok);
  assert.deepEqual(packGaps(ok.pack), []);

  const semMotivo = parsePack('spoken_reel', {
    hook: 'x', lines: [{ text: 'a' }], cta: { text: 'segue lá', because: '' },
  });
  assert.equal(semMotivo.ok, false, 'um CTA sem motivo não passa nem no schema');
});

/* ── Tech UGC e Canvas UGC ────────────────────────────────────────────────── */

test('o Tech UGC precisa de produto, situação e argumento — não de estética', () => {
  const p = parsePack('tech_ugc', {
    productUnderstanding: 'agenda para salão',
    useSituation: 'a dona a marcar horário no telemóvel',
    argument: 'deixa de perder marcação no WhatsApp',
    lines: [{ text: 'eu testei isto na semana passada' }],
  });
  assert.ok(p.ok);
  const gaps = packGaps(p.pack);
  assert.ok(gaps.includes('sem interface nem gravação de tela, não se vê o produto'));
});

test('o Canvas UGC preserva a mecânica e não vira roteiro cinematográfico', () => {
  const p = parsePack('canvas_ugc', {
    mechanic: 'corte seco a cada 2s com texto a mudar',
    observedStructure: 'três batidas, a terceira quebra a expectativa',
    execution: 'grava tudo de uma vez no telemóvel',
  });
  assert.ok(p.ok);
  assert.deepEqual(packGaps(p.pack), []);
  if (p.pack.kind === 'canvas_ugc') {
    assert.equal(p.pack.body.lines.length, 0, 'fala frase por frase não é obrigatória aqui');
  }
});

/* ── Carrossel, fotos e stories ───────────────────────────────────────────── */

test('o carrossel pede capa, slides e template', () => {
  const p = parsePack('carousel', {
    cover: 'o que ninguém conta sobre a primeira entrega',
    slides: [{ index: 0, copy: 'a' }, { index: 1, copy: 'b' }],
  });
  assert.ok(p.ok);
  assert.ok(packGaps(p.pack).includes('falta escolher o template'));
});

test('a sequência de fotos pede função narrativa, não roteiro de vídeo', () => {
  const p = parsePack('photo_sequence', {
    photos: [{ index: 0, role: 'abre o dia' }, { index: 1, role: 'fecha' }],
  });
  assert.ok(p.ok);
  assert.deepEqual(packGaps(p.pack), []);
  assert.ok(!PACK_DELIVERABLES.photo_sequence.some((d) => d.includes('frase por frase')));
});

test('enquete só entra com motivo: o Instagram ter o recurso não é motivo', () => {
  const bom = parsePack('story_sequence', {
    frames: [
      { index: 0, role: 'abre', content: 'conto o que houve' },
      { index: 1, role: 'fecha', content: 'pergunto', interaction: { text: 'caixa de perguntas', because: 'quero saber se acontece com mais gente' } },
    ],
  });
  assert.ok(bom.ok);
  assert.deepEqual(packGaps(bom.pack), []);

  const sem = parsePack('story_sequence', {
    frames: [
      { index: 0, role: 'abre', content: 'a' },
      { index: 1, role: 'fecha', content: 'b', interaction: { text: 'enquete', because: '' } },
    ],
  });
  assert.equal(sem.ok, false);
});

/* ── O pipeline não salta a pessoa ────────────────────────────────────────── */

test('nenhuma peça vai de proposta a pronta sem validação humana', () => {
  const direto = canTransition('proposed', 'ready_to_produce', { approved: false, validated: false });
  assert.equal(direto.ok, false);

  const semValidar = canTransition('to_validate', 'ready_to_produce', { approved: true, validated: false });
  assert.equal(semValidar.ok, false);
  assert.match(semValidar.because, /validado/);

  const ok = canTransition('to_validate', 'ready_to_produce', { approved: true, validated: true });
  assert.equal(ok.ok, true);
});

test('o pack só nasce depois da aprovação estratégica', () => {
  assert.equal(canTransition('proposed', 'to_validate', { approved: false, validated: false }).ok, false);
  assert.equal(canTransition('approved_to_develop', 'to_validate', { approved: true, validated: false }).ok, true);
});

test('«quero ajustar» no material volta a desenvolver, não descarta', () => {
  assert.ok(nextStatuses('to_validate').includes('approved_to_develop'));
  assert.equal(canTransition('to_validate', 'approved_to_develop', { approved: true, validated: false }).ok, true);
});

test('publicado, análise e aprendizado são degraus, não um salto', () => {
  assert.equal(canTransition('published', 'learning_recorded', { approved: true, validated: true }).ok, false);
  assert.equal(canTransition('published', 'in_analysis', { approved: true, validated: true }).ok, true);
  assert.equal(canTransition('in_analysis', 'learning_recorded', { approved: true, validated: true }).ok, true);
});

test('uma linha da base que tenha saltado a validação é detetada', () => {
  assert.deepEqual(
    pipelineBreaches({ status: 'published', approvedAt: '2026-09-01', validatedAt: null }),
    ['Chegou a pronto sem validação humana.'],
  );
  assert.deepEqual(pipelineBreaches({ status: 'proposed', approvedAt: null, validatedAt: null }), []);
});
