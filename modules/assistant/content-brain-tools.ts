import 'server-only';

import { z } from 'zod';
import type { Source } from './domain';

/** As ferramentas do Content Brain para a Carol AI.
 *
 *  A regra que governa todas: **o assistente não inventa vida**. Quando ela
 *  pede uma ideia, a ferramenta devolve as histórias reais que ela já contou
 *  ou conduz à captura. Não existe caminho para «aqui vão dez ideias».
 *
 *  As escritas passam pelo mesmo serviço que a interface, e portanto pelos
 *  mesmos invariants. Estruturar uma história por confirmar é recusado aqui
 *  exatamente como é recusado no botão — não porque a ferramenta se lembre da
 *  regra, mas porque nenhuma das duas a implementa.
 *
 *  Nenhuma é `high`: publicar, responder comentário e enviar DM não estão aqui
 *  e não têm caminho. */

export type ToolRisk = 'read' | 'write' | 'high';

export type Tool = {
  name: string;
  description: string;
  risk: ToolRisk;
  input: z.ZodType;
  run: (args: never, ctx: { entity: { type: string; id: string | null } | null }) => Promise<{ data: unknown; sources: Source[] }>;
};

function define<S extends z.ZodType>(
  name: string,
  description: string,
  input: S,
  run: (args: z.infer<S>, ctx: { entity: { type: string; id: string | null } | null }) => Promise<{ data: unknown; sources: Source[] }>,
  risk: ToolRisk = 'read',
): Tool {
  return { name, description, risk, input, run: run as Tool['run'] };
}

const storySource = (s: { id: string; title: string; capturedAt?: string }): Source => ({
  id: s.id,
  type: 'portfolio',
  label: s.title,
  at: s.capturedAt ?? null,
  href: `/dashboard/content?tab=bank&story=${s.id}`,
});

/* ── Leitura ──────────────────────────────────────────────────────────────── */

const getContentFocus = define(
  'get_content_focus',
  'O que a estratégia de conteúdo precisa agora: o pilar em foco esta semana, porquê, e quanta matéria-prima real existe em cada pilar. Usa isto ANTES de responder qualquer pergunta sobre o que gravar.',
  z.object({}),
  async () => {
    const { contentScreen } = await import('@/modules/content-brain/screen-service');
    const s = await contentScreen();
    return {
      data: {
        focoDaSemana: s.weekly.label,
        porque: s.weekly.rationale,
        precisaDeMapeamento: s.weekly.mappingOnly,
        cobertura: s.coverage.map((c) => ({
          pilar: c.label,
          disponiveis: c.available,
          prontas: c.ready,
          precisaMapear: c.needsMapping,
        })),
        historiasProntas: s.ready.length,
        historiasEmDesenvolvimento: s.developing.length,
      },
      sources: [],
    };
  },
);

const listStoryBank = define(
  'list_story_bank',
  'As situações reais que a Carol já contou e que ainda podem virar conteúdo. É daqui que sai qualquer sugestão de conteúdo pessoal. Se estiver vazio, NÃO inventes: pergunta o que aconteceu.',
  z.object({
    pillar: z.enum(['attraction_journey', 'information_retention', 'authority_conversion', 'connection_personal']).optional(),
    limit: z.number().optional(),
  }),
  async ({ pillar, limit }) => {
    const { suggestableStories } = await import('@/modules/content-brain/service');
    const historias = (await suggestableStories(pillar)).slice(0, Math.min(limit ?? 10, 20));
    return {
      data: historias.length
        ? historias.map((s) => ({
            id: s.id,
            titulo: s.title,
            resumo: s.summary,
            pilar: s.pillar,
            estado: s.status,
            prontaParaGravar: s.status === 'ready_to_record',
          }))
        : {
            vazio: true,
            // A instrução vai no dado, não só no prompt: é o que o modelo lê
            // quando decide o que fazer a seguir.
            oQueFazer:
              'Não há matéria-prima real salva. NÃO inventes uma história. Pergunta à Carol o que aconteceu com ela recentemente e usa capture_story.',
          },
      sources: historias.map(storySource),
    };
  },
);

const getStoryTool = define(
  'get_story',
  'Uma história por inteiro: fatos confirmados, palavras dela, ponto escolhido, estrutura e estado.',
  z.object({ story_id: z.string().uuid() }),
  async ({ story_id }) => {
    const { getStory } = await import('@/modules/content-brain/service');
    const s = await getStory(story_id);
    if (!s) return { data: { encontrada: false }, sources: [] };
    return {
      data: {
        encontrada: true,
        titulo: s.title,
        fatos: s.facts.map((f) => f.text),
        palavrasDela: s.carolQuotes,
        oQueSignificou: s.carolMeaning,
        pilar: s.pillar,
        ponto: s.frameLabel,
        estado: s.status,
        fatosConfirmados: s.factStatus === 'confirmed',
        privacidade: s.privacyLevel,
      },
      sources: [storySource(s)],
    };
  },
);

const getContentWeekPlan = define(
  'get_content_week_plan',
  'O plano da semana: foco, porquê, e que histórias reais foram escolhidas. Se não houver material, diz que falta mapear.',
  z.object({}),
  async () => {
    const { currentWeekPlan } = await import('@/modules/content-brain/plan-service');
    const p = await currentWeekPlan();
    return {
      data: p
        ? {
            semana: p.weekStart,
            foco: p.primaryPillar,
            porque: p.rationale,
            soMapeamento: p.mappingOnly,
            slots: p.slots.map((s) => ({ tipo: s.kind, titulo: s.kind === 'map_pillar' ? s.reason : s.title })),
          }
        : { semPlano: true, oQueFazer: 'Ainda não há plano desta semana. Usa get_content_focus para ver o que falta.' },
      sources: [],
    };
  },
);

const getInstagramPerformance = define(
  'get_instagram_performance',
  'O desempenho real do Instagram dela, comparado com a mediana dela própria. Métrica indisponível aparece como indisponível — nunca a trates como zero.',
  z.object({ limit: z.number().optional() }),
  async ({ limit }) => {
    const { performanceScreen } = await import('@/modules/content-brain/screen-service');
    const p = await performanceScreen();
    return {
      data: {
        conta: p.account,
        ultimaLeitura: p.lastSyncAt,
        pecas: p.pieces.slice(0, Math.min(limit ?? 8, 20)).map((x) => ({
          historia: x.storyTitle,
          publicado: x.publishedAt,
          funcao: x.pillarLabel,
          reelTest: x.trialStatus === 'yes' ? 'sim' : x.trialStatus === 'no' ? 'não' : 'não confirmado',
          leitura: x.readings.map((r) => r.reading),
        })),
      },
      sources: [],
    };
  },
);

const getContentLearningsTool = define(
  'get_content_learnings',
  'O que os dados dela ensinam, com o degrau da escada: observação, sinal, hipótese, em teste, validado ou rejeitado. NUNCA apresentes um sinal como se fosse regra.',
  z.object({}),
  async () => {
    const { learningLadder } = await import('@/modules/content-brain/performance-service');
    const l = await learningLadder(10);
    return {
      data: l.length
        ? l.map((x) => ({
            afirmacao: x.statement,
            degrau: x.ladderState,
            amostra: x.sampleSize,
            confianca: x.confidence,
            podeOrientarDecisao: x.ladderState === 'validated',
          }))
        : { vazio: true, oQueDizer: 'Ainda não temos repetição suficiente para chamar nada de padrão.' },
      sources: [],
    };
  },
);

const listCurrentHypotheses = define(
  'list_current_hypotheses',
  'As hipóteses que valem um novo teste, e as histórias reais elegíveis para o repetir.',
  z.object({}),
  async () => {
    const { learningLadder } = await import('@/modules/content-brain/performance-service');
    const { suggestableStories } = await import('@/modules/content-brain/service');
    const [ladder, historias] = await Promise.all([learningLadder(20), suggestableStories()]);
    const hipoteses = ladder.filter((l) => l.ladderState === 'hypothesis' || l.ladderState === 'signal');
    return {
      data: {
        hipoteses: hipoteses.map((h) => ({ mecanismo: h.mechanism, afirmacao: h.statement, amostra: h.sampleSize })),
        historiasElegiveis: historias.slice(0, 5).map((s) => ({ id: s.id, titulo: s.title })),
      },
      sources: historias.slice(0, 5).map(storySource),
    };
  },
);

const listContentSeries = define(
  'list_content_series',
  'As séries ativas e as continuidades que várias histórias reais já sugerem. Uma série só existe se houver histórias que a sustentem.',
  z.object({}),
  async () => {
    const { detectSeriesCandidates } = await import('@/modules/content-brain/plan-service');
    const sugestoes = await detectSeriesCandidates().catch(() => []);
    return {
      data: sugestoes.length
        ? sugestoes.map((s) => ({
            premissa: s.premise,
            arco: s.arc,
            mecanismo: s.mechanism,
            historias: s.titles,
            porque: s.because,
            forca: s.strength,
          }))
        : { vazio: true, oQueDizer: 'Ainda não vejo continuidade real entre as histórias. Não vou forçar uma série.' },
      sources: [],
    };
  },
);

const listStoryLenses = define(
  'list_story_lenses',
  'As direções de busca para um pilar: que TIPO de situação procurar na memória da Carol. Usa isto quando ela disser «não sei o que contar», «me ajuda a pensar em atração», «não faço ideia». NÃO devolvas ideias — devolve caminhos, e deixa ela escolher.',
  z.object({
    pillar: z.enum(['attraction_journey', 'information_retention', 'authority_conversion', 'connection_personal']),
  }),
  async ({ pillar }) => {
    const { lensPickerData } = await import('@/modules/content-brain/lens-service');
    const d = await lensPickerData(pillar, { visible: 4 });
    return {
      data: {
        introducao: d.intro,
        caminhos: d.primary.map((l) => ({
          id: l.id,
          nome: l.label,
          oQueE: l.description,
          perguntasQueAjudamALembrar: l.memoryPrompts,
        })),
        outros: d.more.map((l) => ({ id: l.id, nome: l.label })),
        comoUsar:
          'Oferece três ou quatro caminhos e pergunta por qual ela quer começar. Uma lente NÃO é uma história: nunca digas que alguma coisa aconteceu com ela.',
      },
      sources: [],
    };
  },
);

const openStoryLens = define(
  'open_story_lens',
  'Abre uma direção de busca e devolve as perguntas que ativam a memória dela. Faz UMA pergunta de cada vez na conversa; as outras ficam para se ela não se lembrar da primeira.',
  z.object({ lens_id: z.string() }),
  async ({ lens_id }) => {
    const { lensById } = await import('@/modules/content-brain/lens-service');
    const { recordLensEvent } = await import('@/modules/content-brain/lens-service');
    const lens = lensById(lens_id);
    if (!lens) return { data: { encontrada: false }, sources: [] };
    await recordLensEvent({ kind: 'lens_selected', lensId: lens.id, pillar: lens.pillar }).catch(() => null);
    return {
      data: {
        encontrada: true,
        nome: lens.label,
        oQueProcurar: lens.whatToLookFor,
        perguntas: lens.memoryPrompts,
        depoisQueElaLembrar: lens.followUpPrompts,
        formasPossiveis: lens.abstractStructures,
        regra:
          'Nenhuma destas perguntas afirma que alguma coisa aconteceu. Se ela disser que não lembrou de nada, oferece OUTRA direção — nunca inventes a situação.',
      },
      sources: [],
    };
  },
  'write',
);

const rateStoryLens = define(
  'rate_story_lens',
  'Guarda o que ela achou de um caminho: liked, not_for_carol (deixa de ser recomendado), later. Usa quando ela disser «esse caminho não é a minha cara» ou «gosto de pensar assim».',
  z.object({
    lens_id: z.string(),
    preference: z.enum(['liked', 'not_for_carol', 'later', 'none']),
  }),
  async ({ lens_id, preference }) => {
    const { setLensPreference } = await import('@/modules/content-brain/lens-service');
    const r = await setLensPreference(lens_id, preference);
    return { data: r.ok ? { ok: true, preference } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

/* ── Escrita de baixo risco ───────────────────────────────────────────────── */

const captureStoryTool = define(
  'capture_story',
  'Salva uma situação real que a Carol acabou de contar, extrai os fatos e devolve o resumo para ela confirmar. Usa isto quando ela disser «aconteceu isso comigo», «ontem eu…», «me irritou que…». NÃO marca como confirmado: quem confirma é ela.',
  z.object({
    text: z.string().min(10).describe('o que ela contou, com as palavras dela'),
    occurred_at: z.string().nullable().optional().describe('AAAA-MM-DD quando aconteceu, se ela disse'),
    lens_id: z.string().nullable().optional().describe('a direção que a fez lembrar, se ela escolheu uma'),
  }),
  async ({ text, occurred_at, lens_id }) => {
    const { captureStory, extractFacts } = await import('@/modules/content-brain/service');
    const criada = await captureStory({
      text,
      source: 'user_text',
      occurredAt: occurred_at ?? null,
      lens: lens_id ? { id: lens_id, source: 'selected' } : null,
    });
    if (!criada.ok) return { data: { ok: false, motivo: criada.error }, sources: [] };

    const extraida = await extractFacts(criada.data.storyId);
    return {
      data: {
        ok: true,
        storyId: criada.data.storyId,
        fatos: extraida.ok ? extraida.data.facts : [],
        perguntas: extraida.ok ? extraida.data.questions : [],
        proximoPasso: 'Mostra os fatos à Carol e pergunta se foi isso que aconteceu. Só ela confirma.',
      },
      sources: [{ id: criada.data.storyId, type: 'portfolio' as const, label: text.slice(0, 60), at: null, href: `/dashboard/content?tab=bank&story=${criada.data.storyId}` }],
    };
  },
  'write',
);

const confirmStoryFactsTool = define(
  'confirm_story_facts',
  'Confirma os fatos de uma história DEPOIS de a Carol dizer que estão certos. Nunca chames isto sem ela ter confirmado explicitamente.',
  z.object({
    story_id: z.string().uuid(),
    facts: z.array(z.string()).min(1).describe('os fatos como ela os confirmou, já com as correções dela'),
    meaning: z.string().nullable().optional().describe('o que aquilo significou para ela, nas palavras dela'),
  }),
  async ({ story_id, facts, meaning }) => {
    const { confirmFacts } = await import('@/modules/content-brain/service');
    const r = await confirmFacts(story_id, { facts, meaning: meaning ?? undefined });
    return { data: r.ok ? { ok: true } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

const saveStoryMeaningTool = define(
  'save_story_meaning',
  'Guarda o que a história significou para a Carol, nas palavras dela. Só o que ela disse — nunca a tua leitura.',
  z.object({ story_id: z.string().uuid(), meaning: z.string().min(3) }),
  async ({ story_id, meaning }) => {
    const { setMeaning } = await import('@/modules/content-brain/service');
    const r = await setMeaning(story_id, meaning);
    return { data: r.ok ? { ok: true } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

const mapStoryToPillarTool = define(
  'map_story_to_pillar',
  'Descobre que função editorial uma história confirmada cumpre. Exige fatos já confirmados.',
  z.object({
    story_id: z.string().uuid(),
    focus: z.enum(['attraction_journey', 'information_retention', 'authority_conversion', 'connection_personal']),
  }),
  async ({ story_id, focus }) => {
    const { mapToPillar } = await import('@/modules/content-brain/service');
    const r = await mapToPillar(story_id, focus);
    return { data: r.ok ? { ok: true, ...r.data } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

const structureStoryTool = define(
  'structure_story',
  'Monta a estrutura de uma história. Exige fatos confirmados e ponto escolhido — se não estiverem, isto recusa e diz o que falta. Não escreve falas: escreve a intenção de cada momento.',
  z.object({ story_id: z.string().uuid() }),
  async ({ story_id }) => {
    const { buildStructure } = await import('@/modules/content-brain/service');
    const r = await buildStructure(story_id);
    return { data: r.ok ? { ok: true, momentos: r.data.beats, sugestoes: r.data.suggestions } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

const selectStoryFrameTool = define(
  'select_story_frame',
  'Grava o ponto da história que a Carol escolheu. O ponto é dela, não teu.',
  z.object({ story_id: z.string().uuid(), frame_id: z.string(), custom_label: z.string().optional() }),
  async ({ story_id, frame_id, custom_label }) => {
    const { selectFrame } = await import('@/modules/content-brain/service');
    const r = await selectFrame(story_id, frame_id, custom_label);
    return { data: r.ok ? { ok: true } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

const setContentStatusTool = define(
  'set_content_status',
  'Muda o estado de uma história: confirmed, mapped, structured, ready_to_record, archived, rejected. As transições ilegítimas são recusadas.',
  z.object({
    story_id: z.string().uuid(),
    status: z.enum(['confirmed', 'mapped', 'structured', 'ready_to_record', 'recorded', 'archived', 'rejected']),
  }),
  async ({ story_id, status }) => {
    const { setStatus } = await import('@/modules/content-brain/service');
    const r = await setStatus(story_id, status);
    return { data: r.ok ? { ok: true, status } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

const markStoryPrivateTool = define(
  'mark_story_private',
  'Marca uma história como privada. Deixa de aparecer em qualquer sugestão. Usa isto assim que ela disser que não quer contar aquilo.',
  z.object({ story_id: z.string().uuid(), level: z.enum(['private', 'restricted', 'content_ok']) }),
  async ({ story_id, level }) => {
    const { setPrivacy } = await import('@/modules/content-brain/service');
    const r = await setPrivacy(story_id, level);
    return { data: r.ok ? { ok: true, level } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

const confirmTrialReelTool = define(
  'confirm_trial_reel',
  'Grava se um Reel foi publicado como Reel Test. A API não diz isso. «Não sei» é resposta válida e fica gravada para não voltar a perguntar.',
  z.object({ media_id: z.string().uuid(), answer: z.enum(['yes', 'no', 'unknown']) }),
  async ({ media_id, answer }) => {
    const { confirmTrial } = await import('@/modules/integrations/instagram/service');
    await confirmTrial(media_id, answer);
    return { data: { ok: true, answer }, sources: [] };
  },
  'write',
);

const planContentWeekTool = define(
  'plan_content_week',
  'Monta a semana escolhendo entre as histórias reais salvas. Se faltar matéria-prima, devolve uma ação de mapear em vez de inventar pauta.',
  z.object({}),
  async () => {
    const { buildWeekPlan } = await import('@/modules/content-brain/plan-service');
    const r = await buildWeekPlan();
    return {
      data: r.ok
        ? { ok: true, foco: r.plan.primaryPillar, porque: r.plan.rationale, slots: r.plan.slots.length, soMapeamento: r.plan.mappingOnly }
        : { ok: false, motivo: r.error },
      sources: [],
    };
  },
  'write',
);

const saveStoryCandidateTool = define(
  'save_story_candidate',
  'Responde a um cartão «talvez valha salvar»: saved guarda como matéria-prima por confirmar, dismissed descarta, private marca como pessoal. Só a Carol decide.',
  z.object({ candidate_id: z.string().uuid(), decision: z.enum(['saved', 'dismissed', 'private']) }),
  async ({ candidate_id, decision }) => {
    const { decideCandidate } = await import('@/modules/content-brain/plan-service');
    const r = await decideCandidate(candidate_id, decision);
    return { data: r.ok ? { ok: true, storyId: r.storyId } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

const addStoryToSeriesTool = define(
  'add_story_to_series',
  'Organiza histórias reais confirmadas como série. Recusa se não houver pelo menos duas histórias que sustentem o arco. Nunca cria episódios que ainda não aconteceram.',
  z.object({
    story_ids: z.array(z.string().uuid()).min(2),
    name: z.string().min(3),
    premise: z.string().min(5),
    arc: z.string().min(5),
    mechanism: z.enum(['journey', 'challenge', 'recurring_process', 'public_learning', 'lens_format']),
  }),
  async (args) => {
    const { adoptSeries } = await import('@/modules/content-brain/plan-service');
    const r = await adoptSeries({
      storyIds: args.story_ids, name: args.name, premise: args.premise, arc: args.arc, mechanism: args.mechanism,
    });
    return { data: r.ok ? { ok: true, seriesId: r.seriesId } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

export const CONTENT_BRAIN_TOOLS: Tool[] = [
  getContentFocus, listStoryLenses, openStoryLens, rateStoryLens,
  listStoryBank, getStoryTool, getContentWeekPlan,
  getInstagramPerformance, getContentLearningsTool, listCurrentHypotheses, listContentSeries,
  captureStoryTool, confirmStoryFactsTool, saveStoryMeaningTool, mapStoryToPillarTool,
  selectStoryFrameTool, structureStoryTool, setContentStatusTool, markStoryPrivateTool,
  confirmTrialReelTool, planContentWeekTool, saveStoryCandidateTool, addStoryToSeriesTool,
];
