import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyWrittenHook,
  craftAdjustedScore,
  ctaVerdict,
  educationVerdict,
  functionBalance,
  hooksCompleteness,
  inferFunction,
  inferModes,
  modeBalance,
  nicheTerritory,
  outlineProblems,
  proofOfCraft,
  storyProblems,
} from './content-engine';

/* ── Função e modo ────────────────────────────────────────────────────────── */

test('a função sai do que a ideia diz, e a declarada ganha', () => {
  assert.equal(
    inferFunction({ hook: 'O brief pedia sorriso. Eu gravei emburrada.', script: 'A marca ficou com o take que eu escolhi. Foi isso que entreguei.', objective: 'autoridade' }),
    'convert',
  );
  assert.equal(
    inferFunction({ hook: 'Larguei 10 anos de restaurante e ainda faço isso toda vez que alguém pede a conta.', script: 'A rotina de quem serviu mesa não sai do corpo.', objective: 'identificação' }),
    'attract_connect',
  );
  assert.equal(
    inferFunction({ hook: 'Quase descartei esse take por causa da luz.', script: 'Mudei a janela, ajustei o corte no CapCut. Salva isso.', objective: 'salvamentos' }),
    'educate_retain',
  );
  assert.equal(inferFunction({ hook: 'qualquer coisa', declared: 'convert' }), 'convert');
});

test('uma ideia pode ter dois modos, e o modo declarado ganha', () => {
  const modos = inferModes({ hook: 'O brief pedia sorriso. Eu gravei emburrada.', script: 'Mostro o take, a decisão, e o que a marca aprovou. Meu namorado riu.' });
  assert.ok(modos.includes('authority'));
  assert.ok(modos.length <= 2);
  assert.deepEqual(inferModes({ hook: 'x', declared: ['personal', 'personal', 'entertainment'] }), ['personal', 'entertainment']);
});

test('«hoje falta conexão» sai do que saiu mesmo', () => {
  const historia = [
    { contentFunction: 'educate_retain' }, { contentFunction: 'educate_retain' }, { contentFunction: 'educate_retain' },
    { contentFunction: 'convert' }, { contentFunction: 'convert' },
  ];
  const b = functionBalance(historia);
  assert.equal(b.missing, 'attract_connect');
  assert.match(b.because, /Hoje falta conexão/);
});

test('com pouco histórico não se inventa desequilíbrio: sugere-se o foco de arranque', () => {
  const b = functionBalance([{ contentFunction: 'convert' }]);
  assert.equal(b.missing, null);
  assert.equal(b.suggest, 'educate_retain');
  assert.match(b.because, /pouco publicado/);
});

test('um modo que não aparece está em falta', () => {
  const b = modeBalance([
    { modes: ['authority', 'information'] }, { modes: ['information'] }, { modes: ['authority'] }, { modes: ['information'] },
  ]);
  assert.ok(b.missing === 'entertainment' || b.missing === 'personal');
});

/* ── A lente ──────────────────────────────────────────────────────────────── */

test('«está mostrando o que está por trás?» responde-se por sinais', () => {
  const sim = proofOfCraft({
    hook: 'Eu quase descartei esse take por causa da luz.',
    script: 'O brief pedia luz limpa. Eu mudei a janela porque a sombra comia a cara. Ficou este, e a marca aprovou.',
  });
  assert.equal(sim.present, true);
  assert.ok(sim.signals.includes('choice'));
  assert.ok(sim.signals.includes('backstage'));

  const nao = proofOfCraft({ hook: 'Bom dia com café na varanda', script: 'Um domingo calmo em casa com o sol.' });
  assert.equal(nao.present, false);
});

test('sem bastidor, uma ideia de conversão vale menos; uma de conexão não perde', () => {
  const craft = { present: false };
  assert.equal(craftAdjustedScore({ score: 80, contentFunction: 'convert', craft }), 56);
  assert.equal(craftAdjustedScore({ score: 80, contentFunction: 'attract_connect', craft }), 80);
  assert.equal(craftAdjustedScore({ score: 80, contentFunction: 'convert', craft: { present: true } }), 80);
});

/* ── Educação sem guru ────────────────────────────────────────────────────── */

test('«5 dicas de iluminação» é guru; «quase descartei esse take» é prova de ofício', () => {
  assert.equal(educationVerdict({ hook: '5 dicas de iluminação para UGC', script: 'Dica um: luz natural. Dica dois: evita contraluz.' }).verdict, 'guru');
  assert.equal(
    educationVerdict({
      hook: 'Eu quase descartei esse take por causa da luz. Foi isso que eu mudei.',
      script: 'Bruto: a sombra comia metade da cara. Ajuste: troquei o lado da janela e cortei aos 1,2 s. Final: ficou este.',
    }).verdict,
    'proof_of_craft',
  );
  assert.equal(
    educationVerdict({ hook: '3 transições que você precisa aprender no CapCut', script: 'Transição um, dois e três, passo a passo.' }).verdict,
    'guru',
  );
  assert.equal(educationVerdict({ hook: 'Domingo sem serviço de sala', script: 'Não sei o que fazer com as mãos.' }).verdict, 'not_education');
});

/* ── Três ganchos ─────────────────────────────────────────────────────────── */

test('os três ganchos trabalham juntos, e a fala pode faltar de propósito', () => {
  const completo = hooksCompleteness({
    visual: 'mostrar o vídeo ruim imediatamente',
    written: 'Eu quase mandei isso pra marca.',
    spoken: 'Esse take estava tecnicamente certo e ainda assim não funcionava.',
  });
  assert.equal(completo.complete, true);

  const semFala = hooksCompleteness({ visual: 'Carol editando, close na timeline', written: 'Demorei meses para perceber isso.' }, { needsSpeech: false });
  assert.equal(semFala.complete, true);

  const falta = hooksCompleteness({ visual: 'Carol editando', written: 'Demorei meses para perceber isso.' });
  assert.equal(falta.complete, false);
  assert.deepEqual(falta.missing, ['spoken']);
});

test('escrito igual ao falado é um gancho só', () => {
  const r = hooksCompleteness({ visual: 'close na cara', written: 'Eu quase mandei isso pra marca', spoken: 'Eu quase mandei isso pra marca' });
  assert.equal(r.redundant, true);
  assert.equal(r.complete, false);
});

test('os cinco tipos de gancho escrito reconhecem-se', () => {
  assert.equal(classifyWrittenHook('Quem também odeia anotar meio-a-meio?'), 'identification');
  assert.equal(classifyWrittenHook('Passei anos anotando pedido no bloco.'), 'experience');
  assert.equal(classifyWrittenHook('Nunca imaginei que uma mesa mudaria tanto a minha casa'), 'emotion');
  assert.equal(classifyWrittenHook('Foi isto que eu mudei na luz'), 'teaching');
  assert.equal(classifyWrittenHook('Primeira marca de fora fechou hoje'), 'update');
  assert.equal(classifyWrittenHook(''), null);
});

/* ── Herói, vilão, guia ───────────────────────────────────────────────────── */

test('o vilão é o problema, nunca a concorrência', () => {
  assert.deepEqual(storyProblems({ hero: 'quem grava sozinha em casa', villain: 'a luz que come a cara', guide: 'a Carol, com o take na mão' }), []);
  const mau = storyProblems({ hero: 'quem grava', villain: 'as outras creators que fazem pior', guide: 'a Carol' });
  assert.ok(mau.some((p) => p.includes('concorrência')));
  const ela = storyProblems({ hero: 'a Carol', villain: 'a luz', guide: 'a Carol' });
  assert.ok(ela.some((p) => p.includes('quem vê')));
});

test('o roteiro que ela vê tem gancho, problema, prova e payoff', () => {
  assert.deepEqual(outlineProblems({ hook: 'a', problem: 'b', development: 'c', proof: 'd', payoff: 'e', cta: 'f' }), []);
  const falta = outlineProblems({ hook: 'a frase', problem: 'o problema' });
  assert.ok(falta.includes('sem prova'));
  assert.ok(falta.includes('sem payoff'));
  assert.deepEqual(outlineProblems({ hook: 'a frase', problem: 'o problema', proof: 'a prova', payoff: 'o fim' }, { needsCta: false }), []);
});

/* ── O remate ─────────────────────────────────────────────────────────────── */

test('para público frio, «me contrata» não serve; «salva isso» serve', () => {
  assert.equal(ctaVerdict('Me contrata para o teu próximo vídeo', 'cold').ok, false);
  assert.equal(ctaVerdict('Pede orçamento no link na bio', 'cold').ok, false);
  assert.equal(ctaVerdict('Salva isso.', 'cold').ok, true);
  assert.equal(ctaVerdict('Segue pra ver o que eu faço com isso', 'cold').ok, true);
  // No feed, para quem já a conhece, o link é legítimo.
  assert.equal(ctaVerdict('Link na bio', 'warm').ok, true);
  assert.equal(ctaVerdict('', 'cold').suggest, 'Salva isso.');
});

/* ── Nicho ────────────────────────────────────────────────────────────────── */

test('skincare fica fora como nicho; maquiagem é experimental; tech é comercial', () => {
  const sk = nicheTerritory('Quero conteúdo de skincare');
  assert.equal(sk.commercial, 'excluded');
  assert.equal(sk.organic, 'deprioritized');
  assert.match(sk.because, /rosácea/);

  const make = nicheTerritory('um vídeo de maquiagem e moda');
  assert.equal(make.commercial, 'not_priority');
  assert.equal(make.organic, 'experimental');

  const tech = nicheTerritory('testar o robô aspirador novo');
  assert.equal(tech.commercial, 'priority');
});
