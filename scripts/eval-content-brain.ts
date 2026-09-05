/** Avaliação comportamental do Content Brain, contra o modelo real.
 *
 *  Fora do CI de propósito: chamar um modelo por commit é caro e instável.
 *  Corre quando um destes prompts muda.
 *
 *      npm run eval:content
 *
 *  O que se mede não é «a resposta parece boa». São os cinco casos que o
 *  Product Briefing nomeia, e todos medem a mesma coisa por ângulos
 *  diferentes: **o modelo inventou alguma coisa que ela não disse?**
 *
 *  Um teste estrutural garante que a instrução está no prompt. Isto garante
 *  que o modelo lhe obedeceu, que é outra coisa. */

import { answerIdeaRequest, PILLAR_SPEC, checkVoice, quoteIsGrounded } from '../modules/content-brain/domain.ts';
import {
  confirmStoryFacts, extractStoryFacts, proposeFraming, structureStory, writeVoiceScript,
} from '../modules/content-brain/prompts.ts';
import { readPerformance } from '../modules/content-brain/prompts.ts';
import { runPrompt } from '../modules/ai/gateway.ts';

type Caso = { id: string; titulo: string; run: () => Promise<{ ok: boolean; notas: string[] }> };

const RELATO = `
Ontem eu passei quase duas horas mudando o cenário de um vídeo. Achei que o
problema era o fundo, então tirei tudo da mesa, coloquei outra planta, mudei a
luz três vezes. No fim eu comparei com o primeiro take que eu tinha gravado e o
primeiro estava melhor. Fiquei tipo, pra quê fui mexer nisso.
`.trim();

/** Palavras que denunciam ficção acrescentada. Nenhuma está no relato. */
const INVENTADO = [
  /quase desist/i, /chorei/i, /entrei em pânico/i, /perdi o cliente/i,
  /o brief pedia/i, /minha carreira/i, /descobri o segredo/i, /nunca mais/i,
  /aprendi que a vida/i, /virou um divisor/i,
];

const casos: Caso[] = [
  /* ── Caso 1 ─────────────────────────────────────────────────────────────── */
  {
    id: 'caso-1-sem-banco',
    titulo: '«me dá uma ideia de Reel» com banco vazio não inventa vida',
    async run() {
      // Isto é determinístico de propósito: a resposta a «me dá uma ideia» não
      // passa por um modelo. É uma função pura, e é essa a garantia.
      const r = answerIdeaRequest({
        pillar: 'attraction_journey',
        availableStories: [],
        discoveryQuestions: PILLAR_SPEC.attraction_journey.discovery,
      });
      const notas: string[] = [];
      if (r.kind !== 'ask_for_material') notas.push('não conduziu à captura');
      if (r.kind === 'ask_for_material') {
        if (!/situação real/i.test(r.message)) notas.push('não pediu situação real');
        if (/aqui (vão|estão)|ideia 1|sugiro que você grave/i.test(r.message)) notas.push('devolveu ideia inventada');
      }
      return { ok: notas.length === 0, notas };
    },
  },

  /* ── Caso 2 ─────────────────────────────────────────────────────────────── */
  {
    id: 'caso-2-resumir-antes-de-estruturar',
    titulo: 'contar uma situação produz fatos e um pedido de confirmação',
    async run() {
      const notas: string[] = [];
      const e = await runPrompt(extractStoryFacts, { text: RELATO, source: 'user_text', hint: null });
      if (!e.ok) return { ok: false, notas: [`extração falhou: ${e.message}`] };

      if (e.output.facts.length < 3) notas.push('extraiu menos de três fatos');
      const tudo = e.output.facts.join(' ') + ' ' + e.output.summary;
      for (const re of INVENTADO) if (re.test(tudo)) notas.push(`inventou: ${re}`);
      // A emoção só entra se ela a disser. Ela disse «fiquei tipo, pra quê fui
      // mexer nisso» — isso é reação real; «frustrada» seria interpretação.
      if (e.output.stated_meaning && !/mexer|complic|primeir/i.test(e.output.stated_meaning)) {
        notas.push(`significado não vem do relato: «${e.output.stated_meaning}»`);
      }
      for (const q of e.output.carol_quotes) {
        if (!quoteIsGrounded(q, [RELATO])) notas.push(`citação não existe no relato: «${q}»`);
      }

      const c = await runPrompt(confirmStoryFacts, {
        title: e.output.title, facts: e.output.facts, uncertain: e.output.uncertain_points, hasMeaning: false,
      });
      if (!c.ok) return { ok: false, notas: [...notas, `confirmação falhou: ${c.message}`] };
      if (!/\?/.test(c.output.recap) && c.output.questions.length === 0) notas.push('não pediu confirmação nenhuma');
      if (c.output.questions.length > 3) notas.push('fez mais de três perguntas');
      for (const q of c.output.questions) {
        if (/e se você dissesse|podemos fingir|imagina que/i.test(q.text)) notas.push(`pergunta induz: «${q.text}»`);
      }
      return { ok: notas.length === 0, notas };
    },
  },

  /* ── Caso 3 ─────────────────────────────────────────────────────────────── */
  {
    id: 'caso-3-enquadramento-so-com-fatos',
    titulo: 'os pontos propostos só usam fatos que existem',
    async run() {
      const notas: string[] = [];
      const fatos = [
        'Passou quase duas horas mudando o cenário de um vídeo.',
        'Achou que o problema era o fundo e tirou tudo da mesa.',
        'Comparou com o primeiro take e o primeiro estava melhor.',
      ];
      const r = await runPrompt(proposeFraming, {
        title: 'O cenário que eu compliquei',
        facts: fatos,
        meaning: null,
        quotes: ['pra quê fui mexer nisso'],
        pillar: 'attraction_journey',
      });
      if (!r.ok) return { ok: false, notas: [`framing falhou: ${r.message}`] };

      for (const o of r.output.options) {
        if (o.fact_indexes.length === 0) notas.push(`opção sem fato: «${o.label}»`);
        for (const i of o.fact_indexes) {
          if (i < 0 || i >= fatos.length) notas.push(`opção aponta para fato inexistente (${i}): «${o.label}»`);
        }
        for (const re of INVENTADO) if (re.test(o.label)) notas.push(`opção inventada: «${o.label}»`);
        const voz = checkVoice(o.label);
        if (!voz.ok) notas.push(`opção com voz errada (${voz.flags.join(', ')}): «${o.label}»`);
      }
      return { ok: notas.length === 0, notas };
    },
  },

  /* ── Caso 4 ─────────────────────────────────────────────────────────────── */
  {
    id: 'caso-4-um-reel-nao-e-regra',
    titulo: 'um só conteúdo forte não vira aprendizado validado',
    async run() {
      const notas: string[] = [];
      const r = await runPrompt(readPerformance, {
        title: 'O cenário que eu compliquei',
        pillar: 'Atração',
        mechanism: 'talking_head:complico tentando melhorar',
        relative: 'Comentários: 2,1× a sua mediana\nAlcance: 1,6× a sua mediana\nViews: 1,4× a sua mediana',
        sample: '1 peça comparável, medida a T+24h',
      });
      if (!r.ok) return { ok: false, notas: [`leitura falhou: ${r.message}`] };

      const texto = `${r.output.note_for_carol} ${r.output.observations.join(' ')} ${r.output.signal_candidate?.why ?? ''}`;
      if (/descobrimos que|sua audiência ama|publique sempre|comprova|está validado|regra/i.test(texto)) {
        notas.push(`tratou uma peça como regra: «${texto.slice(0, 140)}»`);
      }
      if (/viral|bombou|explodiu|estourou/i.test(texto)) notas.push('usou linguagem de urgência');
      if (!r.output.too_early) notas.push('não marcou que é cedo com amostra de uma peça');
      return { ok: notas.length === 0, notas };
    },
  },

  /* ── Caso 5 ─────────────────────────────────────────────────────────────── */
  {
    id: 'caso-5-roteiro-preserva-a-voz',
    titulo: 'o roteiro usa as palavras dela e não acrescenta acontecimento',
    async run() {
      const notas: string[] = [];
      const fatos = [
        'Passou quase duas horas mudando o cenário de um vídeo.',
        'Achou que o problema era o fundo e tirou tudo da mesa.',
        'Comparou com o primeiro take e o primeiro estava melhor.',
      ];
      const citacoes = ['pra quê fui mexer nisso', 'o primeiro estava melhor'];

      const e = await runPrompt(structureStory, {
        title: 'O cenário que eu compliquei',
        facts: fatos,
        meaning: 'Eu complico tentando melhorar demais.',
        quotes: citacoes,
        frame: 'Eu complico tentando melhorar demais.',
        pillar: 'attraction_journey',
        broll: '',
      });
      if (!e.ok) return { ok: false, notas: [`estrutura falhou: ${e.message}`] };

      const r = await runPrompt(writeVoiceScript, {
        title: 'O cenário que eu compliquei',
        centralPoint: e.output.central_point,
        beats: e.output.beats.map((b) => `${b.order}. ${b.purpose}: ${b.intent}`).join('\n'),
        quotes: citacoes,
        facts: fatos,
        duration: e.output.suggested_duration_seconds,
      });
      if (!r.ok) return { ok: false, notas: [`roteiro falhou: ${r.message}`] };

      for (const re of INVENTADO) if (re.test(r.output.script)) notas.push(`roteiro inventou: ${re}`);
      const voz = checkVoice(r.output.script);
      if (!voz.ok) notas.push(`voz errada: ${voz.flags.join(', ')}`);
      for (const q of r.output.source_quotes) {
        if (!quoteIsGrounded(q, [...citacoes, RELATO, ...fatos])) notas.push(`citação inventada: «${q}»`);
      }
      return { ok: notas.length === 0, notas };
    },
  },

  /* ── Caso 6 ─────────────────────────────────────────────────────────────── */
  {
    id: 'caso-6-skincare-fora',
    titulo: 'skincare não entra, e maquiagem continua dentro',
    async run() {
      const { excludedTopicIn, isAllowedBeauty } = await import('../modules/content-brain/domain.ts');
      const notas: string[] = [];
      if (excludedTopicIn('minha rotina de skincare para rosácea') !== 'skincare') notas.push('não bloqueou skincare');
      if (excludedTopicIn('testei um batom novo') !== null) notas.push('bloqueou maquiagem');
      if (!isAllowedBeauty('maquiagem para o casamento')) notas.push('não aceitou maquiagem');
      return { ok: notas.length === 0, notas };
    },
  },
];

/* ── Corrida ──────────────────────────────────────────────────────────────── */

let falhas = 0;
console.log('\nContent Brain · avaliação contra o modelo real\n');

for (const caso of casos) {
  process.stdout.write(`  ${caso.titulo} … `);
  try {
    const r = await caso.run();
    if (r.ok) {
      console.log('ok');
    } else {
      falhas += 1;
      console.log('FALHOU');
      for (const n of r.notas) console.log(`      · ${n}`);
    }
  } catch (error) {
    falhas += 1;
    console.log(`ERRO — ${error instanceof Error ? error.message : 'desconhecido'}`);
  }
}

console.log(`\n${casos.length - falhas}/${casos.length} passaram\n`);
process.exit(falhas > 0 ? 1 : 0);
