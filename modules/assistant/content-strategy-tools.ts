import 'server-only';

import { z } from 'zod';
import type { Source } from './domain';
import type { Tool } from './content-brain-tools';

/** As ferramentas da estratégia de conteúdo para a Carol AI.
 *
 *  Todas leem a MESMA camada que a tela: o mesmo Motor de Prioridades, o mesmo
 *  Mapa, os mesmos aprendizados. Nenhuma calcula prioridade por conta própria.
 *
 *  A razão não é elegância: se o assistente tivesse a sua própria noção do que
 *  priorizar, ela receberia duas respostas diferentes à mesma pergunta — e a
 *  que ela seguisse seria a que estivesse mais à mão, não a que estivesse
 *  certa.
 *
 *  Nenhuma publica, nenhuma valida por ela. Aprovar uma proposta e validar um
 *  roteiro não estão aqui e não têm caminho: são as duas decisões que o PDF
 *  deixa explicitamente com a pessoa. */

function define<S extends z.ZodType>(
  name: string,
  description: string,
  input: S,
  run: (args: z.infer<S>) => Promise<{ data: unknown; sources: Source[] }>,
  risk: Tool['risk'] = 'read',
): Tool {
  return { name, description, risk, input, run: run as Tool['run'] };
}

const weekSource: Source = {
  id: 'content-week',
  type: 'portfolio',
  label: 'A semana de conteúdo',
  at: null,
  href: '/dashboard/content?tab=week',
};

/* ── O que priorizar ──────────────────────────────────────────────────────── */

const getContentWeek = define(
  'get_content_week',
  'O que o CarolOS propôs para esta semana e em que estado está cada proposta. Usa isto para responder «o que devo priorizar esta semana» e «o que está pronto». Não inventes prioridades: o que não estiver aqui não foi priorizado.',
  z.object({}),
  async () => {
    const { currentWeek } = await import('@/modules/content-brain/week-service');
    const w = await currentWeek();
    return {
      data: {
        semana: w.weekStart,
        capacidade: w.capacity,
        resumo: w.summary,
        existe: w.exists,
        propostas: w.proposals.map((p) => ({
          id: p.id,
          assunto: p.topicLabel,
          angulo: p.angle,
          pilar: p.pillarLabel,
          objetivo: p.objectiveLabel,
          lente: p.lensLabel,
          formato: p.formatLabel,
          modalidade: p.modalityLabel,
          porqueAgora: p.whyNow,
          estado: p.statusLabel,
        })),
        precisaDela: w.needsYou.length,
        prontasParaProduzir: w.readyToProduce.length,
      },
      sources: [weekSource],
    };
  },
);

const explainProposal = define(
  'explain_content_proposal',
  'Por que é que uma proposta entrou na semana: as razões estruturadas que a escolheram, uma a uma. Usa isto para «por que esse conteúdo entrou» e «por que você sugeriu esse formato». Nunca inventes uma razão que não esteja aqui.',
  z.object({ proposal_id: z.string().describe('o id da proposta') }),
  async ({ proposal_id }) => {
    const { currentWeek } = await import('@/modules/content-brain/week-service');
    const w = await currentWeek();
    const p = w.proposals.find((x) => x.id === proposal_id);
    if (!p) return { data: { encontrada: false }, sources: [] };
    return {
      data: {
        encontrada: true,
        assunto: p.topicLabel,
        angulo: p.angle,
        objetivo: p.objectiveLabel,
        formato: p.formatLabel,
        porqueAgora: p.whyNow,
        razoes: p.evidence.map((e) => ({ tipo: e.kind, razao: e.detail })),
        estado: p.statusLabel,
      },
      sources: [weekSource],
    };
  },
);

/* ── O Mapa ───────────────────────────────────────────────────────────────── */

const getEditorialMap = define(
  'get_editorial_map',
  'O Mapa Editorial: os três pilares, os assuntos de cada um e a fase em que estão (Agora, Próximos, Depois, Pausado), mais o foco atual. Usa isto para «sobre o que eu falo» e «o que está faltando no meu perfil». Pilar é território; SaaS é foco comercial, não pilar.',
  z.object({}),
  async () => {
    const { editorialMap } = await import('@/modules/content-brain/editorial-service');
    const { COMMERCIAL_FOCUS } = await import('@/modules/content-brain/editorial');
    const m = await editorialMap();
    return {
      data: {
        focoAtual: m.focus ? { nome: m.focus.label, itens: m.focus.itemLabels, desde: m.focus.since } : null,
        focoComercial: COMMERCIAL_FOCUS.market,
        pilares: m.pillars.map((p) => ({
          pilar: p.label,
          paraQue: p.purpose,
          emAgora: p.liveCount,
          assuntos: p.topics.map((t) => ({
            nome: t.label,
            fase: t.stateLabel,
            jaUsado: t.useCount,
            ultimaVez: t.lastUsedAt,
          })),
        })),
      },
      sources: [{ id: 'content-map', type: 'portfolio', label: 'O Mapa Editorial', at: null, href: '/dashboard/content?tab=map' }],
    };
  },
);

/* ── O Laboratório ────────────────────────────────────────────────────────── */

const getFormatLab = define(
  'get_format_lab',
  'O que já foi testado e o que ainda não, por formato e por dimensão. Usa isto para «qual formato ainda não testamos». Um formato «não testado» não é mau: é desconhecido, e dizer o contrário é inventar evidência.',
  z.object({}),
  async () => {
    const { formatLab } = await import('@/modules/content-brain/lab-service');
    const lab = await formatLab();
    return {
      data: {
        formatos: lab.formats.map((f) => ({
          formato: f.valueLabel,
          estado: f.stateLabel,
          leitura: f.phrasing,
          porque: f.because,
          amostra: f.sampleSize,
          comparadoCom: f.comparedWith,
        })),
        naoTestados: lab.untestedFormats,
        outrasDimensoes: lab.others.map((f) => ({
          dimensao: f.dimensionLabel,
          valor: f.valueLabel,
          estado: f.stateLabel,
        })),
      },
      sources: [{ id: 'content-lab', type: 'portfolio', label: 'O Laboratório', at: null, href: '/dashboard/content?tab=lab' }],
    };
  },
);

/* ── A comunidade ─────────────────────────────────────────────────────────── */

const getCommunityQuality = define(
  'get_community_quality',
  'A qualidade das interações dos últimos 30 dias: quanto é identificação, pergunta, história pessoal, conversa, e quanto é elogio solto. Usa isto para falar de comunidade. NUNCA digas o que uma pessoa concreta quis dizer — a leitura é do conjunto.',
  z.object({ days: z.number().int().min(7).max(90).optional() }),
  async ({ days }) => {
    const { communityWindow } = await import('@/modules/content-brain/community-service');
    const c = await communityWindow({ days: days ?? 30 });
    return {
      data: {
        leitura: c.reading,
        total: c.total,
        classificados: c.classified,
        semLeitura: c.unclassified,
        amostraPequena: c.tooSmall,
        porIntencao: c.breakdown.map((b) => ({ intencao: b.label, quantos: b.count })),
      },
      sources: [{ id: 'content-community', type: 'portfolio', label: 'A comunidade', at: null, href: '/dashboard/content?tab=audit' }],
    };
  },
);

/* ── Aprendizados ─────────────────────────────────────────────────────────── */

const getRecentLearnings = define(
  'get_recent_learnings',
  'O que aprendemos e com que força. Usa isto para «o que aprendemos recentemente». Respeita o nível: observação e sinal NÃO são conclusão, e um aprendizado que perdeu força não volta a ser regra.',
  z.object({}),
  async () => {
    const { activeLearningRows } = await import('@/modules/content-brain/lab-service');
    const rows = await activeLearningRows({ limit: 6 });
    return {
      data: rows.map((l) => ({
        id: l.id,
        aprendizado: l.statement,
        nivel: l.level,
        porque: l.because,
        amostra: l.sampleSize,
        perdeuForca: l.demoted,
      })),
      sources: [{ id: 'content-learnings', type: 'portfolio', label: 'Aprendizados', at: null, href: '/dashboard/content?tab=audit' }],
    };
  },
);

/* ── Escrita: só o que não é decisão dela ─────────────────────────────────── */

const changeTopicPhase = define(
  'set_topic_phase',
  'Muda a fase de um assunto do Mapa: agora, próximos, depois ou pausado. Pausar não apaga — o assunto continua no mapa e para de ser sugerido.',
  z.object({
    topic_id: z.string(),
    state: z.enum(['now', 'next', 'later', 'paused']),
    reason: z.string().max(200).optional(),
  }),
  async ({ topic_id, state, reason }) => {
    const { setTopicState } = await import('@/modules/content-brain/editorial-service');
    const r = await setTopicState(topic_id, state, reason ?? '');
    return { data: r.ok ? { ok: true, fase: r.data.state } : { ok: false, motivo: r.error }, sources: [] };
  },
  'write',
);

const saveContentReference = define(
  'save_content_reference',
  'Guarda um Reel de referência a partir do endereço e tenta ler a engenharia dele — estrutura, abertura, ritmo. O assunto e a personalidade de quem publicou ficam de fora: o que se aproveita é o mecanismo, e gera hipótese, nunca regra.',
  z.object({ url: z.string(), note: z.string().max(300).optional() }),
  async ({ url, note }) => {
    const { captureReference } = await import('@/modules/content-brain/lab-service');
    const r = await captureReference({ url, note });
    return {
      data: r.ok ? { ok: true, id: r.data.id, analisada: r.data.analysed } : { ok: false, motivo: r.error },
      sources: [],
    };
  },
  'write',
);

export const CONTENT_STRATEGY_TOOLS: Tool[] = [
  getContentWeek,
  explainProposal,
  getEditorialMap,
  getFormatLab,
  getCommunityQuality,
  getRecentLearnings,
  changeTopicPhase,
  saveContentReference,
];
