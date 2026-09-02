import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PILLARS,
  PILLAR_SPEC,
  catalogProblems,
  energyBudget,
  energyOf,
  estimateMinutes,
  freshUntilFor,
  genericProblems,
  guruProblems,
  ideaProblems,
  ideaFingerprint,
  isRepeat,
  isStale,
  matchTrends,
  pillarDebt,
  pillarPriority,
  replaceability,
  platformTreatmentsDiffer,
  qualityVerdict,
  seriesIsViable,
  shouldGenerate,
  similarity,
} from './domain';

const NOW = new Date('2026-09-02T00:00:00Z');

const GUIAO =
  'Abro a mostrar dois vídeos lado a lado, digo que um vendeu e o outro não, ' +
  'e explico que a diferença foi o gancho e não a luz. Depois mostro a timeline ' +
  'do CapCut com o corte aos 1,2 segundos e fecho a perguntar qual escolheriam.';

/* ── Pilares ──────────────────────────────────────────────────────────────── */

test('sem história nenhuma, a sala vem primeiro', () => {
  // É o maior activo dela e tinha zero vídeos. Com a lista vazia, a ordem é a
  // dos pesos da auditoria — e o peso maior é o da sala.
  assert.equal(pillarPriority([])[0], 'A_SALA');
});

test('o pilar que está em falta face ao peso alvo vem primeiro', () => {
  // Quatro peças, todas do teste: o pilar da sala está com zero e devia ter 30%.
  const historia = [
    { pillar: 'TESTEI', at: '2026-09-01' },
    { pillar: 'TESTEI', at: '2026-08-31' },
    { pillar: 'TESTEI', at: '2026-08-30' },
    { pillar: 'TESTEI', at: '2026-08-29' },
  ];
  assert.equal(pillarPriority(historia)[0], 'A_SALA');
  assert.equal(pillarPriority(historia).at(-1), 'TESTEI');
});

test('a dívida por pilar é a diferença para o peso alvo', () => {
  const debt = pillarDebt([{ pillar: 'A_SALA' }, { pillar: 'A_SALA' }]);
  // A sala saiu 100% das vezes e devia ser 30%: está com excesso.
  assert.ok(debt.A_SALA < 0);
  // O teste não saiu nenhuma vez e devia ser 25%: está em falta.
  assert.ok(debt.TESTEI > 0.2);
});

test('os pesos dos pilares somam um', () => {
  const soma = PILLARS.reduce((acc, p) => acc + PILLAR_SPEC[p].weight, 0);
  assert.ok(Math.abs(soma - 1) < 0.001, `somam ${soma}`);
});

test('ensinar creators deixou de ser um pilar', () => {
  // A auditoria: «FORÇADO e errado para este perfil». Estava na lista antiga.
  assert.equal(PILLARS.includes('CREATOR_EDUCATION' as never), false);
  assert.equal(PILLARS.includes('UGC_AUTHORITY' as never), false);
});

/* ── Repetição ────────────────────────────────────────────────────────────── */

test('a mesma ideia com outras palavras é a mesma ideia', () => {
  const a = ideaFingerprint({
    platform: 'instagram',
    pillar: 'TESTEI',
    hook: 'Um UGC bonito pode ser um anúncio mau',
  });
  const b = ideaFingerprint({
    platform: 'instagram',
    pillar: 'TESTEI',
    hook: 'Anúncio mau: quando o UGC é bonito',
  });
  assert.equal(a, b);
});

test('o mesmo gancho repetido é apanhado mesmo com a impressão digital diferente', () => {
  const anterior = [
    { fingerprint: 'outra', hook: 'Demorei meses a entender que UGC bonito não vende nada' },
  ];
  const { repeat, because } = isRepeat(
    {
      platform: 'tiktok',
      pillar: 'A_SALA',
      hook: 'Demorei meses a entender que UGC bonito não vende',
    },
    anterior,
  );
  assert.equal(repeat, true);
  assert.ok(because?.includes('gancho'));
});

test('uma ideia nova não é marcada como repetida', () => {
  const anterior = [{ fingerprint: 'x', hook: 'Como consegui o primeiro cliente internacional' }];
  const { repeat } = isRepeat(
    { platform: 'tiktok', pillar: 'CORPO', hook: 'O corte que faz um vídeo parecer um anúncio verdadeiro' },
    anterior,
  );
  assert.equal(repeat, false);
});

test('a semelhança é simétrica e mede palavras, não letras', () => {
  assert.equal(similarity('gato preto grande', 'gato preto grande'), 1);
  assert.equal(similarity('', 'qualquer coisa'), 0);
});

/* ── Porta anti-genérico ──────────────────────────────────────────────────── */

test('«5 dicas para ser UGC creator» não passa', () => {
  const problemas = genericProblems({
    hook: '5 dicas para ser UGC creator em 2026',
    script: GUIAO,
  });
  assert.ok(problemas.some((p) => p.includes('lugar-comum')));
});

test('«3 erros que tu cometes» não passa', () => {
  const problemas = genericProblems({ hook: '3 erros que ninguém te conta sobre UGC', script: GUIAO });
  assert.ok(problemas.some((p) => p.includes('lugar-comum')));
});

test('«o que ninguém diz sobre» é a mesma fórmula e também não passa', () => {
  // Saiu na primeira corrida real, como título de TikTok. A regra só conhecia
  // «conta» e «contou», e exigia o «te».
  for (const gancho of [
    'O que ninguém diz sobre gravar UGC que vende',
    'O que ninguém te conta sobre começar em UGC',
    'A verdade que ninguém quer admitir sobre UGC',
  ]) {
    assert.ok(
      genericProblems({ hook: gancho, script: GUIAO }).some((p) => p.includes('lugar-comum')),
      gancho,
    );
  }
});

test('a tendência liga-se à ideia por assunto, não por título ao caractere', () => {
  const trends = [
    { id: 't1', title: 'Breakdown de edição em tela dividido', description: 'A timeline do CapCut ao lado do vídeo final.' },
    { id: 't2', title: 'Micro-vlog matinal com voz por cima', description: 'Rotina filmada em planos curtos.' },
  ];
  // A ideia fala do mesmo assunto sem repetir o título — que é o que o modelo
  // faz sempre, e que fazia a ligação nunca acontecer.
  const ligadas = matchTrends(
    {
      whyNow: 'Mostrar a timeline do CapCut ao lado do resultado final explica a edição sem a explicar.',
      hook: 'O corte que faz um vídeo parecer um anúncio verdadeiro',
      script: 'tela dividido: à esquerda a timeline, à direita o vídeo final.',
    },
    trends,
  );
  assert.deepEqual(ligadas, ['t1']);
});

test('uma ideia sem relação nenhuma não cita tendência nenhuma', () => {
  const ligadas = matchTrends(
    { whyNow: 'Contar como consegui o primeiro cliente de fora.', hook: 'Primeiro cliente gringo', script: 'História do email ao pagamento.' },
    [{ id: 't1', title: 'Breakdown de edição em tela dividido', description: 'A timeline do CapCut.' }],
  );
  assert.deepEqual(ligadas, []);
});

test('uma ideia sem guião não é trabalho preparado', () => {
  const problemas = genericProblems({
    hook: 'O maior erro que cometi quando comecei foi tentar deixar tudo bonito',
    script: 'Falar sobre isso.',
  });
  assert.ok(problemas.some((p) => p.includes('gravar')));
});

test('uma ideia concreta com guião passa a porta', () => {
  assert.deepEqual(
    genericProblems({
      hook: 'O maior erro que cometi quando comecei em UGC foi tentar deixar tudo bonito',
      script: GUIAO,
    }),
    [],
  );
});

const boaNota = {
  carolIdentity: 85, story: 80, proof: 78, humanConflict: 82, brandSignal: 80,
  engagement: 70, originality: 85, recordability: 90, platformNative: 75,
  authorityWithoutPreaching: 88,
};

test('o veredicto é uma frase, não dez números', () => {
  const boa = qualityVerdict(boaNota);
  assert.equal(boa.verdict, 'record_today');
  assert.equal(boa.phrase, 'Eu gravaria este hoje.');

  const media = qualityVerdict({
    carolIdentity: 60, story: 55, proof: 60, humanConflict: 55, brandSignal: 55,
    engagement: 50, originality: 60, recordability: 70, platformNative: 60,
    authorityWithoutPreaching: 60,
  });
  assert.equal(media.verdict, 'good_not_urgent');
});

test('quatro dimensões têm veto, e nenhuma se compensa com média', () => {
  const vetos: [Partial<typeof boaNota>, string][] = [
    [{ carolIdentity: 20 }, 'trocando o rosto'],
    [{ originality: 20 }, 'qualquer pessoa'],
    [{ recordability: 10 }, 'sozinha'],
    [{ authorityWithoutPreaching: 15 }, 'aulas'],
  ];
  for (const [mau, frase] of vetos) {
    const r = qualityVerdict({ ...boaNota, ...mau });
    assert.equal(r.verdict, 'reject', JSON.stringify(mau));
    assert.ok(r.phrase.includes(frase), `«${r.phrase}» não diz «${frase}»`);
  }
});

/* ── Os portões da auditoria ──────────────────────────────────────────────── */

test('«a Carol é substituível?» é o teste que reprova mais', () => {
  // correto, bem escrito, e de qualquer pessoa.
  const anonima = replaceability({
    hook: 'Três formas de melhorar a iluminação num vídeo curto',
    script: 'Mostro a janela, mostro o candeeiro, comparo os dois resultados.',
  });
  assert.equal(anonima.replaceable, true);
  assert.ok(anonima.because.includes('trocando o rosto'));

  // A mesma técnica, com a vida dela lá dentro.
  const dela = replaceability({
    hook: 'Passei dez anos a anotar pedido e nunca reparei na luz da sala',
    script: 'No restaurante dos meus pais a luz era amarela. Fui entender isso a gravar em casa.',
  });
  assert.equal(dela.replaceable, false);
  assert.ok(dela.marks >= 1);
});

test('as cinco marcas dela contam, uma a uma', () => {
  const casos = [
    'O pedido meio-a-meio que eu mais odiava anotar na sala',
    'O meu namorado construiu isto e eu fui testar sem facilitar',
    'A minha rosácea em Agosto parece uma cidade a arder',
    'PB, Porto, Braga: ninguém acerta no meu sotaque',
    'Larguei o restaurante e ainda conto o tempo em covers',
  ];
  for (const hook of casos) {
    assert.equal(replaceability({ hook, script: '' }).replaceable, false, hook);
  }
});

test('o filtro anti-guru apanha a personagem de professora', () => {
  for (const hook of [
    '5 dicas para ser UGC creator',
    'Como conseguir o teu primeiro cliente pago',
    'As ferramentas que todo creator precisa',
    'Vou ensinar como se faz um bom hook',
  ]) {
    assert.ok(guruProblems({ hook }).length > 0, hook);
  }
  // Mostrar não é ensinar: isto passa.
  assert.deepEqual(
    guruProblems({ hook: 'O brief pedia sorriso no segundo 1. Eu entrei emburrada.' }),
    [],
  );
});

test('o filtro anti-catálogo apanha o que é portfólio, não post', () => {
  assert.ok(
    catalogProblems({ hook: 'A casa', format: 'montagem estética muda' }).some((p) => p.includes('muda')),
  );
  assert.ok(
    catalogProblems({ hook: 'O app faz isto', script: 'Inclui: treinos, desafios, comunidade e mais.' })
      .some((p) => p.includes('funcionalidades')),
  );
  assert.ok(
    catalogProblems({ hook: 'Chegar a casa', onScreenText: ['Home', 'Rituals'] })
      .some((p) => p.includes('inglês de stock')),
  );
  assert.deepEqual(
    catalogProblems({ hook: 'A sala estava vazia. A primeira coisa que fizemos foi montar esta mesa.', format: 'talking head' }),
    [],
  );
});

test('o portão único corre os quatro filtros de uma vez', () => {
  // Genérica, de guru, e sem nada dela: três motivos, uma chamada.
  const problemas = ideaProblems({
    hook: '5 dicas para melhorar o teu UGC',
    script: 'Falo das cinco dicas uma a uma, com exemplos genéricos de iluminação e enquadramento.',
    onScreenText: ['Welcome To My'],
  });
  assert.ok(problemas.length >= 3, problemas.join(' | '));

  // Uma ideia da auditoria passa inteira.
  assert.deepEqual(
    ideaProblems({
      hook: 'Meio peperoni, meio frango, sem cebola só no frango. Isto, num papel, era o meu terror.',
      script:
        'Passei anos a anotar isto sem errar. O meu namorado passou meses a ensinar um WhatsApp a fazer o mesmo. ' +
        'Fui testar sem facilitar e pedi o que ele tinha deixado de fora. No fim apareceu o total certo.',
      format: 'talking head',
    }),
    [],
  );
});

/* ── Energia ──────────────────────────────────────────────────────────────── */

test('a energia sai do que a ideia pede', () => {
  assert.equal(energyOf({ shots: 2, editingComplexity: 'simple', recordMinutes: 8, editMinutes: 10 }), 'low');
  assert.equal(energyOf({ shots: 8, editingComplexity: 'medium', recordMinutes: 25, editMinutes: 30 }), 'high');
  assert.equal(energyOf({ shots: 3, editingComplexity: 'heavy', recordMinutes: 10, editMinutes: 12 }), 'high');
  assert.equal(energyOf({ shots: 4, editingComplexity: 'medium', recordMinutes: 12, editMinutes: 18 }), 'normal');
});

test('num dia com gravação de marca não se propõe outra produção', () => {
  const cheio = energyBudget({ commercialShootToday: true, minutesCommitted: 120 });
  assert.equal(cheio.max, 'low');
  assert.ok(cheio.because.includes('mesma sessão'));

  assert.equal(energyBudget({ commercialShootToday: false, minutesCommitted: 0 }).max, 'high');
});

/* ── Plataforma ───────────────────────────────────────────────────────────── */

test('o Reel republicado no TikTok é apanhado', () => {
  const igual = platformTreatmentsDiffer(
    { platform: 'instagram', hook: 'Um UGC bonito pode ser um anúncio mau', format: 'reel', script: GUIAO },
    { platform: 'tiktok', hook: 'Um UGC bonito pode ser um anúncio mau', format: 'reel', script: GUIAO },
  );
  assert.equal(igual.differ, false);
  assert.ok(igual.because.includes('gancho'));
});

test('tratamentos nativos diferentes passam', () => {
  const diferente = platformTreatmentsDiffer(
    {
      platform: 'instagram',
      hook: 'Um UGC bonito pode ser um anúncio mau',
      format: 'reel com comparação lado a lado',
      script: GUIAO,
    },
    {
      platform: 'tiktok',
      hook: 'Consegui o primeiro cliente de fora antes de o meu inglês ficar bom',
      format: 'talking head com capturas de tela',
      script: 'Conto a história desde o email até ao pagamento, com as capturas por cima.',
    },
  );
  assert.equal(diferente.differ, true);
});

/* ── Carga e envelhecimento ───────────────────────────────────────────────── */

test('com sete ideias por gravar não se somam mais catorze', () => {
  const cheio = shouldGenerate(10, { cap: 6 });
  assert.equal(cheio.generate, false);
  assert.equal(cheio.refreshOnly, true);
  assert.ok(cheio.because.includes('substituo'));

  assert.equal(shouldGenerate(2, { cap: 6 }).generate, true);
  assert.equal(shouldGenerate(2, { cap: 6 }).refreshOnly, false);
});

test('uma ideia de tendência morre com a tendência', () => {
  assert.equal(isStale({ freshUntil: '2026-08-30', generatedAt: '2026-08-20T00:00:00Z' }, NOW), true);
  assert.equal(isStale({ freshUntil: '2026-09-20', generatedAt: '2026-08-20T00:00:00Z' }, NOW), false);
});

test('sem prazo declarado uma ideia envelhece à mesma', () => {
  assert.equal(isStale({ freshUntil: null, generatedAt: '2026-07-01T00:00:00Z' }, NOW), true);
  assert.equal(isStale({ freshUntil: null, generatedAt: '2026-08-30T00:00:00Z' }, NOW), false);
});

test('uma ideia sem tendência não ganha prazo inventado', () => {
  assert.equal(freshUntilFor({ hasTrend: false }, NOW), null);
  assert.equal(freshUntilFor({ hasTrend: true, trendFreshness: 'fresh' }, NOW), '2026-09-12');
});

/* ── Séries ───────────────────────────────────────────────────────────────── */

test('uma série sem premissa nem episódios pela frente não é uma série', () => {
  const fraca = seriesIsViable({ name: 'UGC Lab', premise: 'coisas', structure: '', nextTopics: [] });
  assert.equal(fraca.viable, false);
  assert.deepEqual(fraca.missing, ['premissa', 'estrutura repetível', 'episódios pela frente']);
});

test('uma série completa é viável', () => {
  const boa = seriesIsViable({
    name: 'Como eu faria este anúncio',
    premise: 'Pego num anúncio real de uma marca e mostro como o teria feito em UGC.',
    structure: 'Mostro o anúncio, aponto o que falha, gravo a minha versão em 20 segundos.',
    nextTopics: ['aspirador', 'app de finanças'],
  });
  assert.equal(boa.viable, true);
});

/* ── Tempo ────────────────────────────────────────────────────────────────── */

test('a estimativa cresce com as tomadas e com o peso da edição', () => {
  const simples = estimateMinutes({ shots: 3, durationSeconds: 25, editingComplexity: 'simple' });
  const pesada = estimateMinutes({ shots: 3, durationSeconds: 25, editingComplexity: 'heavy' });
  assert.ok(pesada.edit > simples.edit);
  assert.equal(simples.record, pesada.record);

  const muitas = estimateMinutes({ shots: 8, durationSeconds: 45, editingComplexity: 'medium' });
  assert.ok(muitas.record > simples.record);
});
